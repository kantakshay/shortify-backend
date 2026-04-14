const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

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

// ---- MOCK DB ----
const store = new Map();

const mockDB = {
  saveUrl: async (shortCode, longUrl) => {
    console.log("[MOCK DB] Saving:", shortCode);

    store.set(shortCode, {
      short_code: shortCode,
      long_url: longUrl,
    });

    console.log(`[MOCK DB] Size: ${store.size}`);
  },

  fetchUrl: async (shortCode) => {
    console.log("[MOCK DB] Fetching:", shortCode);
    return store.get(shortCode) || null;
  },
};

// ---- DYNAMODB ----
const dynamoDB = {
  saveUrl: async (shortCode, longUrl) => {
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

      if (err.name === "ConditionalCheckFailedException") {
        throw new Error("Short code already exists");
      }

      throw err;
    }
  },

  fetchUrl: async (shortCode) => {
    const result = await dynamo.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { short_code: shortCode },
    }));

    return result.Item || null;
  },
};

// ---- STRATEGY ----
const db = stage === "local" ? mockDB : dynamoDB;

console.log(`Using ${stage === "local" ? "MOCK DB" : "DynamoDB"}`);

module.exports = db;