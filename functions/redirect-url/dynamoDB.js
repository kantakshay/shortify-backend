
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand ,UpdateCommand} = require("@aws-sdk/lib-dynamodb");

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

 const incrementClicks = async (shortCode) => {
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { short_code: shortCode },

        UpdateExpression: "SET clicks = if_not_exists(clicks, :zero) + :inc",
        ConditionExpression: "attribute_exists(short_code)",

        ExpressionAttributeValues: {
          ":inc": 1,
          ":zero": 0,
        },
      })
    );
  } catch (err) {
    console.error("[DynamoDB ERROR - incrementClicks]", err);
    // Do NOT throw → don't break redirect flow
  }
};

  module.exports= {incrementClicks, fetchUrl}