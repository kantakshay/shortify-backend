const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { dynamo, TABLE_NAME } = require("../../shared/dynamo");

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