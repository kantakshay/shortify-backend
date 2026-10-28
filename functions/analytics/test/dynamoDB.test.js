const { catchError } = require("./helpers");

const { expect } = require("chai");
const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const { fetchUrl } = require("../dynamoDB");

describe("analytics dynamoDB: fetchUrl", () => {
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

  it("gets the item by short code", async () => {
    const item = { short_code: "abc123", long_url: "https://example.com", clicks: 3 };
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
