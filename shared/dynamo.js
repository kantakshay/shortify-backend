// DynamoDB document client and table name, shared by every Lambda.
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = process.env.TABLE_NAME;

// Fail at cold start rather than on the first request
if (!TABLE_NAME) {
  throw new Error("TABLE_NAME is not defined");
}

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.AWS_REGION || "ap-south-1",
    // Only the integration tests set this (to DynamoDB Local). It is never set
    // in Lambda, so production always talks to the real DynamoDB.
    ...(process.env.DYNAMODB_ENDPOINT && { endpoint: process.env.DYNAMODB_ENDPOINT }),
  }),
);

module.exports = { dynamo, TABLE_NAME };
