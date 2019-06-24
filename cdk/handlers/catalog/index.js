const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

module.exports.processRecords = async (event, context) => {
    for (let record of event.Records) {
        console.log({record});
        await processRecord(record);
    }
};

module.exports.get = async (event, context) => {
    console.log({event});
    const docId = event.pathParameters.proxy;
    const url = s3.getSignedUrl('getObject', {
        Bucket: process.env.S3_BUCKET,
        Key: docId
    });
    if (url) {
        return {
            statusCode: '302',
            headers: {
                'Location': url
            },
            body: ''
        }
    }
    return {
        statusCode: '404',
        body: `Doc with ${docId} not found.`
    }
};

async function processRecord(record) {
    let object = record.s3.object;
    console.log({object});
    return ddb.put({
        TableName: process.env.DOCS_TABLE, Item: {
            ...object,
            docId: object.key
        }
    }).promise();
}