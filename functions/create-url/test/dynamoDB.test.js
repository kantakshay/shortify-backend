const { conditionalCheckFailed, catchError, silenceConsole } = require("./helpers");

const { expect } = require("chai");
const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const saveUrl = require("../dynamoDB");

describe("create-url dynamoDB: saveUrl", () => {
  let ddbMock;

  before(() => {
    ddbMock = mockClient(DynamoDBDocumentClient);
  });

  beforeEach(() => {
    ddbMock.reset();
  });

  after(() => {
    ddbMock.restore();
  });

  silenceConsole();

  it("writes the item with a conditional put so existing codes are never overwritten", async () => {
    ddbMock.on(PutCommand).resolves({});

    await saveUrl("abc123", "https://example.com/");

    const calls = ddbMock.commandCalls(PutCommand);
    expect(calls).to.have.lengthOf(1);
    const input = calls[0].args[0].input;
    expect(input.TableName).to.equal("test-table");
    expect(input.ConditionExpression).to.equal("attribute_not_exists(short_code)");
    expect(input.Item).to.include({ short_code: "abc123", long_url: "https://example.com/" });
    expect(new Date(input.Item.created_at).toISOString()).to.equal(input.Item.created_at);
  });

  // Regression test for Bug 2: the service detects collisions by err.name.
  it("rethrows a ConditionalCheckFailedException with its name intact", async () => {
    ddbMock.on(PutCommand).rejects(conditionalCheckFailed());

    const err = await catchError(saveUrl("abc123", "https://example.com/"));

    expect(err.name).to.equal("ConditionalCheckFailedException");
  });

  it("rethrows other DynamoDB errors unchanged", async () => {
    ddbMock.on(PutCommand).rejects(new Error("Throughput exceeded"));

    const err = await catchError(saveUrl("abc123", "https://example.com/"));

    expect(err.message).to.equal("Throughput exceeded");
  });
});
