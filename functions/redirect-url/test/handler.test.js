const { silenceConsole, expectCors, parseBody } = require("./helpers");

const { expect } = require("chai");
const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const { main } = require("../handler");

const visit = (shortCode) => main({ pathParameters: { short_code: shortCode } });

describe("redirect-url handler (GET /{short_code})", () => {
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

  it("returns 302 with the long URL in Location and CORS headers", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { short_code: "abc123", long_url: "https://example.com/page" },
    });
    ddbMock.on(UpdateCommand).resolves({});

    const res = await visit("abc123");

    expect(res.statusCode).to.equal(302);
    expect(res.headers.Location).to.equal("https://example.com/page");
    expectCors(res);
  });

  // Stats are recorded on a click but never shown to the person clicking
  it("does not include stats such as clicks or click times in the redirect", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        short_code: "abc123",
        long_url: "https://example.com/page",
        clicks: 5,
        created_at: "2026-10-28T00:00:00.000Z",
        last_clicked_at: "2026-10-29T12:00:00.000Z",
      },
    });
    ddbMock.on(UpdateCommand).resolves({});

    const res = await visit("abc123");

    expect(res.body).to.be.undefined;
    expect(JSON.stringify(res.headers)).to.not.match(/clicks|created_at|last_clicked_at/);
  });

  it("reads the short code from the path parameters", async () => {
    ddbMock.on(GetCommand).resolves({});

    await visit("abc123");

    const input = ddbMock.commandCalls(GetCommand)[0].args[0].input;
    expect(input.Key).to.deep.equal({ short_code: "abc123" });
  });

  it("returns 404 with a JSON error for an unknown code", async () => {
    ddbMock.on(GetCommand).resolves({});

    const res = await visit("nope");

    expect(res.statusCode).to.equal(404);
    expectCors(res);
    expect(parseBody(res)).to.deep.equal({ error: "URL not found" });
  });

  it("returns 400 when the path has no short code", async () => {
    const res = await main({ pathParameters: null });

    expect(res.statusCode).to.equal(400);
    expect(parseBody(res).error).to.equal("Short code is required");
  });

  // Security: internal error details must not reach the caller.
  it("returns 500 with a generic message when the lookup fails", async () => {
    ddbMock.on(GetCommand).rejects(new Error("DynamoDB unavailable"));

    const res = await visit("abc123");

    expect(res.statusCode).to.equal(500);
    expectCors(res);
    expect(parseBody(res)).to.deep.equal({ error: "Internal Server Error" });
  });
});
