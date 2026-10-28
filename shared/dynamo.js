// DynamoDB document client and table name, shared by every Lambda.
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = process.env.TABLE_NAME;

// Fail at cold start rather than on the first request
if (!TABLE_NAME) {
  throw new Error("TABLE_NAME is not defined");
}

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || "ap-south-1" })
);

module.exports = { dynamo, TABLE_NAME };
