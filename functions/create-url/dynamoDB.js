
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

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

  const saveUrl = async (shortCode, longUrl) => {
    try {
      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          short_code: shortCode,
          long_url: longUrl,
          created_at: new Date().toISOString(),
        },
        ConditionExpression: "attribute_not_exists(short_code)",
      }));
    } catch (err) {
      console.error("[DynamoDB ERROR]", err);
      throw err;
    }
  }


module.exports = saveUrl;