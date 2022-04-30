import {ApiGatewayManagementApi} from "aws-sdk";
import {create} from "ipfs-http-client";
import {AbortController} from "node-abort-controller";
import {GetObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {Readable} from "stream";

const BUCKET_NAME = process.env.BUCKET_NAME;
const REGION = process.env.REGION;

if (!BUCKET_NAME) throw new Error('Missing BUCKET_NAME');
if (!REGION) throw new Error('Missing REGION');

// @ts-ignore
global.AbortController = AbortController;

const s3Client = new S3Client({
    apiVersion: '2006-03-01',
    region: REGION,
});
const infuraUrl = 'https://ipfs.infura.io:5001';

// Todo: Add infura with api key details
const ipfs = create({url: infuraUrl});

export const handler = async (event: any) => {
    if (!event.body) {
        console.log('Missing event.body')
        return {statusCode: 500, body: {error: 'Missing event.body'}};
    }

    console.log('event', JSON.stringify(event))
    console.log('body', JSON.stringify(event.body))

    const body = JSON.parse(event.body);

    // Todo: handle array of filenames
    const filename = body.data.filename;

    if (!filename) return {statusCode: 400, body: {error: 'Missing filename parameter'}};

    const connectionId = event.requestContext.connectionId;
    console.log('connectionId', connectionId);

    const managementApi = new ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName + '/' + event.requestContext.stage,
    });

    try {
        await managementApi.postToConnection({ConnectionId: connectionId, Data: 'STARTED'}).promise();
        // Todo: loop all filenames

        const response = await s3Client.send(new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: filename,
        }));
        const stream = response.Body as Readable
        const buffer = await getBufferFromStream(stream);

        const hash = await ipfs.add(buffer);
        const successResponse = JSON.stringify({filename, ipfsHash: `ipfs://${hash.path}`});
        await managementApi.postToConnection({ConnectionId: connectionId, Data: successResponse}).promise();
        await managementApi.postToConnection({ConnectionId: connectionId, Data: 'DONE'}).promise();
        await managementApi.deleteConnection({ConnectionId: connectionId}).promise();
    } catch (e: any) {
        console.log('Stack', e?.stack);
        const errorResponse = JSON.stringify({error: e?.stack});
        await managementApi.postToConnection({ConnectionId: connectionId, Data: errorResponse}).promise();
        await managementApi.deleteConnection({ConnectionId: connectionId}).promise();
        return {
            statusCode: 500,
            body: {error: 'Failed to post to connections'}
        };
    }

    return {
        statusCode: 200,
        body: 'Done'
    };
};

function getBufferFromStream(stream: Readable) {
    return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []
        stream.on('data', chunk => chunks.push(chunk))
        stream.once('end', () => resolve(Buffer.concat(chunks)))
        stream.once('error', reject)
    });
}


