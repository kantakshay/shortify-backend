const { GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { dynamo, TABLE_NAME } = require("../../shared/dynamo");

const fetchUrl = async (shortCode) => {
  const result = await dynamo.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { short_code: shortCode },
    }),
  );

  return result.Item || null;
};

// Counts the click and records when it happened, in one write
const incrementClicks = async (shortCode) => {
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { short_code: shortCode },

        UpdateExpression:
          "SET clicks = if_not_exists(clicks, :zero) + :inc, last_clicked_at = :now",
        ConditionExpression: "attribute_exists(short_code)",

        ExpressionAttributeValues: {
          ":inc": 1,
          ":zero": 0,
          ":now": new Date().toISOString(),
        },
      }),
    );
  } catch (err) {
    console.error("[DynamoDB ERROR - incrementClicks]", err);
    // Do NOT throw → don't break redirect flow
  }
};

module.exports = { incrementClicks, fetchUrl };
