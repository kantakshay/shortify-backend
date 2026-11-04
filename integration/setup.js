// Setup for the integration tests, loaded with mocha's --require before any
// test file. The tests run the real lambda code against DynamoDB Local
// (npm run db:start: port 8100 on this machine → the container's port 8000),
// so the condition and update expressions are checked by a real DynamoDB
// engine instead of a mock.

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// These must be set before shared/dynamo.js and create-url/service.js load
process.env.DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || "http://localhost:8100";
process.env.TABLE_NAME = "url-shortener-integration";
process.env.AWS_REGION = "ap-south-1";
process.env.BASE_URL = "https://short.test/integration";
// DynamoDB Local accepts any credentials, and the SDK needs some. Always use
// fake ones, so these tests can never act with real AWS credentials.
process.env.AWS_ACCESS_KEY_ID = "local";
process.env.AWS_SECRET_ACCESS_KEY = "local";
delete process.env.AWS_SESSION_TOKEN;
delete process.env.AWS_PROFILE;

// Safety: the tests create and delete a table, so never point them at AWS
const { hostname } = new URL(process.env.DYNAMODB_ENDPOINT);
if (!["localhost", "127.0.0.1"].includes(hostname)) {
  throw new Error(`Integration tests only run against DynamoDB Local, not ${hostname}`);
}

const {
  CreateTableCommand,
  DeleteTableCommand,
  ListTablesCommand,
  waitUntilTableExists,
} = require("@aws-sdk/client-dynamodb");
const { dynamo, TABLE_NAME } = require("../shared/dynamo");

// The same key schema as the real table, read from its definition, so the
// test table can't drift from production
const { Properties } = yaml.load(
  fs.readFileSync(path.join(__dirname, "../serverless/dynamodb-resources.yml"), "utf8"),
).Resources.UrlTable;

// DynamoDB Local can take a few seconds to start (especially in CI)
const waitForDynamoDbLocal = async () => {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      return await dynamo.send(new ListTablesCommand({}));
    } catch (err) {
      if (attempt === 30) {
        throw new Error(
          `DynamoDB Local is not reachable at ${process.env.DYNAMODB_ENDPOINT}. ` +
            "Start it with: npm run db:start (needs Docker Desktop running)",
          { cause: err },
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
};

const deleteTable = () => dynamo.send(new DeleteTableCommand({ TableName: TABLE_NAME }));

// Set once the table exists, so a failed setup doesn't add a second, confusing
// error from trying to delete a table that was never created
let tableCreated = false;

exports.mochaHooks = {
  async beforeAll() {
    this.timeout(60000);

    const { TableNames } = await waitForDynamoDbLocal();
    // Left over from an interrupted run
    if (TableNames.includes(TABLE_NAME)) await deleteTable();

    // Only the key schema and billing mode: DynamoDB Local doesn't support
    // deletion protection or point-in-time recovery
    await dynamo.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
        AttributeDefinitions: Properties.AttributeDefinitions,
        KeySchema: Properties.KeySchema,
        BillingMode: Properties.BillingMode,
      }),
    );
    tableCreated = true;
    await waitUntilTableExists({ client: dynamo, maxWaitTime: 30 }, { TableName: TABLE_NAME });
  },

  async afterAll() {
    if (tableCreated) await deleteTable();
  },
};
