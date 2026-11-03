const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { dynamo, TABLE_NAME } = require("../../shared/dynamo");

// expiresAt is optional, in epoch seconds
const saveUrl = async (shortCode, longUrl, expiresAt) => {
  try {
    await dynamo.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          short_code: shortCode,
          long_url: longUrl,
          created_at: new Date().toISOString(),
          ...(expiresAt !== undefined && { expires_at: expiresAt }),
        },
        // A code is never reused, even after its link expires: old copies of
        // the link (flyers, emails, bookmarks) must not lead somewhere new
        ConditionExpression: "attribute_not_exists(short_code)",
      }),
    );
  } catch (err) {
    // A taken code is normal, not a failure: the caller decides what it means
    // (retry with a new random code, or 409 for a custom code)
    if (err.name !== "ConditionalCheckFailedException") {
      console.error("[DynamoDB ERROR]", err);
    }
    throw err;
  }
};

module.exports = saveUrl;
