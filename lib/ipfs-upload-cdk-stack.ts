import * as cdk from '@aws-cdk/core';
import {Duration} from '@aws-cdk/core';
import {WebSocketApi, WebSocketStage} from "@aws-cdk/aws-apigatewayv2";
import {WebSocketLambdaIntegration} from "@aws-cdk/aws-apigatewayv2-integrations";
import {NodejsFunction} from "@aws-cdk/aws-lambda-nodejs";
import {Effect, PolicyStatement} from "@aws-cdk/aws-iam";
import {Bucket, CfnBucket, HttpMethods} from "@aws-cdk/aws-s3";
import {Cors, LambdaIntegration, RestApi} from "@aws-cdk/aws-apigateway";
import {Environment} from "../bin/environment";



export class IpfsUploadCdkStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps, envs?: Environment) {
        if(!envs) throw new Error('Setup your environment variables in a .env at the root of the project')
        super(scope, id, props);
        const {
            STAGE,
            REGION,
            BUCKET_NAME,
            DOMAIN_NAME,
            IPFS_URL,
            INFURA_PROJECT_ID,
            INFURA_SECRET
        } = envs;

        const connectHandler = new NodejsFunction(this, 'IpfsUploadConnect', {
            entry: 'lambdas/websocket/connect.ts',
        });

        const disconnectHandler = new NodejsFunction(this, 'IpfsUploadDisconnect', {
            entry: 'lambdas/websocket/disconnect.ts',
        });

        const ipfsUploadHandler = new NodejsFunction(this, 'IpfsUploadHandler', {
            entry: 'lambdas/websocket/ipfs-upload.ts',
            environment: {
                BUCKET_NAME,
                REGION,
                IPFS_URL,
                INFURA_PROJECT_ID,
                INFURA_SECRET
            },
            timeout: Duration.seconds(60)
        });

        ipfsUploadHandler.addToRolePolicy(new PolicyStatement({
            actions: [
                "iam:PassRole",
                "s3:ListAllMyBuckets",
                "s3:ListBucket",
                "s3:GetObject",
                "s3:GetObjectAcl",
                "execute-api:ManageConnections"
            ],
            resources: ['*'],
            effect: Effect.ALLOW,
        }))

        const webSocketApi = new WebSocketApi(this, 'IpfsUploadWebsocket', {
            connectRouteOptions: {integration: new WebSocketLambdaIntegration('IpfsUploadConnectHandler', connectHandler)},
            disconnectRouteOptions: {integration: new WebSocketLambdaIntegration('IpfsUploadDisconnectHandler', disconnectHandler)},
        });

        const apiStage = new WebSocketStage(this, 'IpfsUploadWebsocketStage', {
            webSocketApi,
            stageName: STAGE,
            autoDeploy: true,
        });

        webSocketApi.addRoute('ipfs-upload', {
            integration: new WebSocketLambdaIntegration('IpfsUploadHandler', ipfsUploadHandler),
        });

        const connectionsArns = this.formatArn({
            service: 'execute-api',
            resourceName: `${apiStage.stageName}/POST/*`,
            resource: webSocketApi.apiId,
        });

        ipfsUploadHandler.addToRolePolicy(
            new PolicyStatement({
                actions: ['execute-api:ManageConnections'],
                resources: [connectionsArns]
            })
        );

        const api = new RestApi(this, `IpfsUploadApi`, {
            restApiName: 'IpfsUploadApi',
            defaultCorsPreflightOptions: {
                allowOrigins: Cors.ALL_ORIGINS,
                allowMethods: Cors.ALL_METHODS,
                allowHeaders: Cors.DEFAULT_HEADERS,
            },
            deploy: true,
            deployOptions: {
                stageName: STAGE,
                cachingEnabled: false,
            },
        });

        const bucket = new Bucket(this, 'IpfsUploadBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            bucketName: BUCKET_NAME,
            cors: [
                {
                    allowedMethods: [
                        HttpMethods.GET,
                        HttpMethods.POST,
                        HttpMethods.PUT,
                    ],
                    allowedOrigins: [DOMAIN_NAME],
                    allowedHeaders: ['*'],
                    maxAge: 3000,
                },
            ],
            lifecycleRules: [
                {
                    enabled: true,
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
                    expiration: Duration.days(1)
                }
            ]
        });

        const cfnBucket = bucket.node.defaultChild as CfnBucket
        cfnBucket.accelerateConfiguration = {
            accelerationStatus: 'Enabled',
        }

        const getPreSignedUrl = new NodejsFunction(this, 'GetPreSignedUrl', {
            entry: 'lambdas/handlers/get-presigned-url.ts',
            environment: {
                BUCKET_NAME: cfnBucket.bucketName!
            }
        });

        bucket.grantPut(getPreSignedUrl);
        bucket.grantPutAcl(getPreSignedUrl);
        bucket.grantRead(getPreSignedUrl);

        api.root
            .addResource('presigned-url')
            .addMethod('GET', new LambdaIntegration(getPreSignedUrl));
    }
}
