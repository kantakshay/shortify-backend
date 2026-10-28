const { GetCommand } = require("@aws-sdk/lib-dynamodb");
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

module.exports = { fetchUrl };
