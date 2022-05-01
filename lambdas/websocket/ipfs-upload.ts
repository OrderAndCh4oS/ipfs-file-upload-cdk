import {ApiGatewayManagementApi} from "aws-sdk";
import {create} from "ipfs-http-client";
import {AbortController} from "node-abort-controller";
import {GetObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {Readable} from "stream";

const BUCKET_NAME = process.env.BUCKET_NAME;
const REGION = process.env.REGION;
const IPFS_URL = process.env.IPFS_URL
const INFURA_PROJECT_ID = process.env.INFURA_PROJECT_ID
const INFURA_SECRET = process.env.INFURA_SECRET

if (!BUCKET_NAME) throw new Error('Missing BUCKET_NAME');
if (!REGION) throw new Error('Missing REGION');
if (!IPFS_URL) throw new Error('Missing IPFS_URL)');
if (!INFURA_PROJECT_ID) throw new Error('Missing INFURA_PROJECT_ID)');
if (!INFURA_SECRET) throw new Error('Missing INFURA_SECRET)');

console.log(INFURA_PROJECT_ID)
console.log(INFURA_SECRET)

// @ts-ignore
global.AbortController = AbortController;

const s3Client = new S3Client({
    apiVersion: '2006-03-01',
    region: REGION,
});

const Authorization = 'Basic ' + Buffer.from(`${INFURA_PROJECT_ID}:${INFURA_SECRET}`).toString('base64');

const ipfs = create({
    url: IPFS_URL,
    headers: {Authorization}
});

export const handler = async (event: any) => {
    if (!event.body) {
        console.log('Missing event.body')
        return {statusCode: 500, body: {error: 'Missing event.body'}};
    }

    console.log('event', JSON.stringify(event))
    console.log('body', JSON.stringify(event.body))

    const body = JSON.parse(event.body);

    // Todo: handle array of filenames

    if (!body.data.filenames) return {statusCode: 400, body: {error: 'Missing filename parameter'}};

    const filenames = body.data.filenames.split(',');

    const connectionId = event.requestContext.connectionId;
    console.log('connectionId', connectionId);

    const managementApi = new ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName + '/' + event.requestContext.stage,
    });

    try {
        const startResponse = JSON.stringify({status: 'STARTED'});
        await managementApi.postToConnection({ConnectionId: connectionId, Data: startResponse}).promise();

        for (const filename of filenames) {
            const addingResponse = JSON.stringify({status: 'ADDING', filename});
            await managementApi.postToConnection({ConnectionId: connectionId, Data: addingResponse}).promise();
            const response = await s3Client.send(new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: filename,
            }));
            const stream = response.Body as Readable
            const buffer = await getBufferFromStream(stream);
            const hash = await ipfs.add(buffer);
            const addedResponse = JSON.stringify({status: 'ADDED', filename, ipfsHash: `ipfs://${hash.path}`});
            await managementApi.postToConnection({ConnectionId: connectionId, Data: addedResponse}).promise();
        }

        const endResponse = JSON.stringify({status: 'COMPLETE'})
        await managementApi.postToConnection({ConnectionId: connectionId, Data: endResponse}).promise();
        await managementApi.deleteConnection({ConnectionId: connectionId}).promise();
    } catch (e: any) {
        console.log('Stack', e?.stack);
        const errorResponse = JSON.stringify({status: 'ERROR', message: e?.stack});
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


