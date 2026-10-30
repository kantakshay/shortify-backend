const { conditionalCheckFailed, catchError, silenceConsole } = require("./helpers");

const { expect } = require("chai");
const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const { getLongUrl } = require("../service");

describe("redirect-url service: getLongUrl", () => {
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

  it("returns the long URL and counts the click", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { short_code: "abc123", long_url: "https://example.com/page" },
    });
    ddbMock.on(UpdateCommand).resolves({});

    const longUrl = await getLongUrl("abc123");

    expect(longUrl).to.equal("https://example.com/page");
    const updates = ddbMock.commandCalls(UpdateCommand);
    expect(updates).to.have.lengthOf(1);
    expect(updates[0].args[0].input.Key).to.deep.equal({ short_code: "abc123" });
  });

  // Regression test for Bug 1: an unknown code must not create a row.
  it("throws a 404 for an unknown code without writing anything", async () => {
    ddbMock.on(GetCommand).resolves({});

    const err = await catchError(getLongUrl("nope"));

    expect(err.statusCode).to.equal(404);
    expect(err.message).to.equal("URL not found");
    expect(ddbMock.commandCalls(UpdateCommand)).to.have.lengthOf(0);
  });

  // Junk rows left behind by Bug 1 have clicks but no long_url.
  it("throws a 404 for a row with no long_url", async () => {
    ddbMock.on(GetCommand).resolves({ Item: { short_code: "junk", clicks: 1 } });

    const err = await catchError(getLongUrl("junk"));

    expect(err.statusCode).to.equal(404);
    expect(ddbMock.commandCalls(UpdateCommand)).to.have.lengthOf(0);
  });

  it("throws a 400 when the short code is missing", async () => {
    const err = await catchError(getLongUrl(undefined));

    expect(err.statusCode).to.equal(400);
    expect(err.message).to.equal("Short code is required");
    expect(ddbMock.commandCalls(GetCommand)).to.have.lengthOf(0);
  });

  it("still returns the URL when counting the click fails", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { short_code: "abc123", long_url: "https://example.com" },
    });
    ddbMock.on(UpdateCommand).rejects(conditionalCheckFailed());

    expect(await getLongUrl("abc123")).to.equal("https://example.com");
  });

  it("rethrows lookup failures", async () => {
    ddbMock.on(GetCommand).rejects(new Error("DynamoDB unavailable"));

    const err = await catchError(getLongUrl("abc123"));

    expect(err.message).to.equal("DynamoDB unavailable");
    expect(err.statusCode).to.be.undefined;
  });

  // Regression test for Bug 7: /MyCode used to 404 because codes are stored lowercase.
  it("looks up and counts mixed-case codes in lowercase", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { short_code: "mycode", long_url: "https://example.com" },
    });
    ddbMock.on(UpdateCommand).resolves({});

    const longUrl = await getLongUrl("MyCode");

    expect(longUrl).to.equal("https://example.com");
    const getInput = ddbMock.commandCalls(GetCommand)[0].args[0].input;
    expect(getInput.Key).to.deep.equal({ short_code: "mycode" });
    const updateInput = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(updateInput.Key).to.deep.equal({ short_code: "mycode" });
  });
});

describe("redirect-url service: expired links", () => {
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

  const inSeconds = (offset) => Math.floor(Date.now() / 1000) + offset;

  // Expiry: expired links stay in the table, so the redirect must check the date itself.
  it("throws a 404 for an expired link without counting the click", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { short_code: "sale", long_url: "https://example.com", expires_at: inSeconds(-60) },
    });

    const err = await catchError(getLongUrl("sale"));

    expect(err.statusCode).to.equal(404);
    expect(err.message).to.equal("URL not found");
    expect(ddbMock.commandCalls(UpdateCommand)).to.have.lengthOf(0);
  });

  it("still redirects and counts a link whose expiry is in the future", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { short_code: "sale", long_url: "https://example.com", expires_at: inSeconds(3600) },
    });
    ddbMock.on(UpdateCommand).resolves({});

    expect(await getLongUrl("sale")).to.equal("https://example.com");
    expect(ddbMock.commandCalls(UpdateCommand)).to.have.lengthOf(1);
  });
});
