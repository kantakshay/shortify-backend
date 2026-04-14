const AWS = require("aws-sdk");

const stage = process.env.STAGE || "local";

// ---- MOCK DB (in-memory) ----
const store = new Map();

const mockDB = {
  saveUrl: async (shortCode, longUrl) => {
    console.log("[MOCK DB] Saving:", shortCode);

    store.set(shortCode, {
      short_code: shortCode,
      long_url: longUrl,
    });
  },

  fetchUrl: async (shortCode) => {
    console.log("[MOCK DB] Fetching:", shortCode);

    return store.get(shortCode);
  },
};

// ---- DYNAMODB ----
const dynamo = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TABLE_NAME;

const dynamoDB = {
  saveUrl: async (shortCode, longUrl) => {
    console.log("[DynamoDB] Saving:", shortCode);

    await dynamo.put({
      TableName: TABLE_NAME,
      Item: {
        short_code: shortCode,
        long_url: longUrl,
        created_at: new Date().toISOString(),
      },
      ConditionExpression: "attribute_not_exists(short_code)",
    }).promise();
  },

  fetchUrl: async (shortCode) => {
    console.log("[DynamoDB] Fetching:", shortCode);

    const result = await dynamo.get({
      TableName: TABLE_NAME,
      Key: { short_code: shortCode },
    }).promise();

    return result.Item;
  },
};

// ---- STRATEGY SWITCH ----
const db = stage === "local" ? mockDB : dynamoDB;

console.log(`Using ${stage === "local" ? "MOCK DB" : "DynamoDB"}`);

module.exports = db;