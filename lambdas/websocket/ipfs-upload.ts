import {ApiGatewayManagementApi} from "aws-sdk";

const BUCKET_NAME = process.env.BUCKET_NAME;

if (!BUCKET_NAME) throw new Error('Missing BUCKET_NAME');

export const handler = async (event: any) => {
    if (!event.body) {
        console.log('Missing event.body')
        return {statusCode: 500, body: {error: 'Missing event.body'}};
    }

    console.log('event', JSON.stringify(event))
    console.log('body', JSON.stringify(event.body))

    const body = JSON.parse(event.body);
    const filename = body.data.filename; // Todo: handle array of filenames

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
        // Todo: upload to ipfs via infura, with api key
        // Todo: send message about status of upload success/fail for each
        // Todo: pin with infura
        // Todo: send message about status of pinning success/fail for each
        await managementApi.postToConnection({ConnectionId: connectionId, Data: 'DONE'}).promise();
        // Todo: kick connection
    } catch (e: any) {
        console.log('Stack', e?.stack);
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


