const { conditionalCheckFailed, catchError, silenceConsole } = require("./helpers");

const { expect } = require("chai");
const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const { fetchUrl, incrementClicks } = require("../dynamoDB");

describe("redirect-url dynamoDB", () => {
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

  describe("fetchUrl", () => {
    it("gets the item by short code", async () => {
      const item = { short_code: "abc123", long_url: "https://example.com" };
      ddbMock.on(GetCommand).resolves({ Item: item });

      const result = await fetchUrl("abc123");

      expect(result).to.deep.equal(item);
      const input = ddbMock.commandCalls(GetCommand)[0].args[0].input;
      expect(input).to.deep.equal({ TableName: "test-table", Key: { short_code: "abc123" } });
    });

    it("returns null when the code does not exist", async () => {
      ddbMock.on(GetCommand).resolves({});

      expect(await fetchUrl("nope")).to.be.null;
    });

    it("rethrows DynamoDB errors", async () => {
      ddbMock.on(GetCommand).rejects(new Error("DynamoDB unavailable"));

      const err = await catchError(fetchUrl("abc123"));

      expect(err.message).to.equal("DynamoDB unavailable");
    });
  });

  describe("incrementClicks", () => {
    // The condition is the Bug 1 safety net: without it UpdateItem creates a new row.
    it("increments clicks only on an existing item", async () => {
      ddbMock.on(UpdateCommand).resolves({});

      await incrementClicks("abc123");

      const calls = ddbMock.commandCalls(UpdateCommand);
      expect(calls).to.have.lengthOf(1);
      expect(calls[0].args[0].input).to.deep.equal({
        TableName: "test-table",
        Key: { short_code: "abc123" },
        UpdateExpression: "SET clicks = if_not_exists(clicks, :zero) + :inc",
        ConditionExpression: "attribute_exists(short_code)",
        ExpressionAttributeValues: { ":inc": 1, ":zero": 0 },
      });
    });

    it("does not throw when the update fails", async () => {
      ddbMock.on(UpdateCommand).rejects(conditionalCheckFailed());

      expect(await incrementClicks("gone")).to.be.undefined;
    });
  });
});
