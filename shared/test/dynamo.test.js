const { expect } = require("chai");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const modulePath = require.resolve("../dynamo");

// Loads a fresh copy of ../dynamo with the given env vars (undefined = unset),
// then puts the env and the module cache back.
const loadWith = (env) => {
  const saved = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete require.cache[modulePath];

  try {
    return require(modulePath);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[modulePath];
  }
};

const regionOf = async (client) => {
  const { region } = client.config;
  return typeof region === "function" ? region() : region;
};

describe("shared dynamo client", () => {
  it("exports a document client and the table name from TABLE_NAME", () => {
    const { dynamo, TABLE_NAME } = loadWith({ TABLE_NAME: "my-table" });

    expect(dynamo).to.be.an.instanceOf(DynamoDBDocumentClient);
    expect(TABLE_NAME).to.equal("my-table");
  });

  it("connects to the region in AWS_REGION", async () => {
    const { dynamo } = loadWith({ TABLE_NAME: "my-table", AWS_REGION: "eu-west-1" });

    expect(await regionOf(dynamo)).to.equal("eu-west-1");
  });

  it("defaults to ap-south-1 when AWS_REGION is not set", async () => {
    const { dynamo } = loadWith({ TABLE_NAME: "my-table", AWS_REGION: undefined });

    expect(await regionOf(dynamo)).to.equal("ap-south-1");
  });

  // Every Lambda now refuses to start without a table name (analytics never checked).
  it("throws at load time when TABLE_NAME is not set", () => {
    expect(() => loadWith({ TABLE_NAME: undefined })).to.throw("TABLE_NAME is not defined");
  });
});
