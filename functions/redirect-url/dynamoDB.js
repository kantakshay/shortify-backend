
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const stage = process.env.STAGE ?? "local";
const TABLE_NAME = process.env.TABLE_NAME;

console.log("----STAGE:-----", process.env.STAGE);
console.log("----Table name:-----", process.env.TABLE_NAME);

// Validate config
if (!TABLE_NAME && stage !== "local") {
  throw new Error("TABLE_NAME is not defined");
}

// Dynamo client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-south-1",
});

const dynamo = DynamoDBDocumentClient.from(client);

  const fetchUrl = async (shortCode) => {
    const result = await dynamo.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { short_code: shortCode },
    }));

    return result.Item || null;
  }

  module.exports= fetchUrl