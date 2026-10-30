const { conditionalCheckFailed, catchError, silenceConsole } = require("./helpers");

const { expect } = require("chai");
const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const saveUrl = require("../dynamoDB");
const { nowInSeconds } = require("../../../shared/expiry");

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

  it("writes the item with a conditional put so live codes are never overwritten", async () => {
    ddbMock.on(PutCommand).resolves({});

    await saveUrl("abc123", "https://example.com/");

    const calls = ddbMock.commandCalls(PutCommand);
    expect(calls).to.have.lengthOf(1);
    const input = calls[0].args[0].input;
    expect(input.TableName).to.equal("test-table");
    expect(input.Item).to.include({ short_code: "abc123", long_url: "https://example.com/" });
    expect(new Date(input.Item.created_at).toISOString()).to.equal(input.Item.created_at);
    expect(input.Item).to.not.have.property("expires_at");
  });

  // Security: a code is never reused, even after its link expires, so old
  // copies of a link can't be hijacked to point somewhere new.
  it("never overwrites an existing code, even an expired one", async () => {
    ddbMock.on(PutCommand).resolves({});

    await saveUrl("abc123", "https://example.com/");

    const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
    expect(input.ConditionExpression).to.equal("attribute_not_exists(short_code)");
    expect(input).to.not.have.property("ExpressionAttributeValues");
  });

  it("stores expires_at in epoch seconds when an expiry is given", async () => {
    ddbMock.on(PutCommand).resolves({});
    const expiresAt = nowInSeconds() + 3600;

    await saveUrl("abc123", "https://example.com/", expiresAt);

    const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
    expect(input.Item.expires_at).to.equal(expiresAt);
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
