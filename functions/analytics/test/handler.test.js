const { silenceConsole, expectCors, parseBody } = require("./helpers");

const { expect } = require("chai");
const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const { main } = require("../handler");

const getStats = (shortCode) => main({ pathParameters: { short_code: shortCode } });

describe("analytics handler (GET /analytics/{short_code})", () => {
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

  it("returns 200 with the stats as JSON and CORS headers", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        short_code: "abc123",
        long_url: "https://example.com",
        clicks: 42,
        created_at: "2026-10-28T00:00:00.000Z",
        last_clicked_at: "2026-10-30T09:15:00.000Z",
      },
    });

    const res = await getStats("abc123");

    expect(res.statusCode).to.equal(200);
    expectCors(res);
    expect(parseBody(res)).to.deep.equal({
      short_code: "abc123",
      long_url: "https://example.com",
      clicks: 42,
      created_at: "2026-10-28T00:00:00.000Z",
      last_clicked_at: "2026-10-30T09:15:00.000Z",
    });
  });

  it("returns 404 with a JSON error for an unknown code", async () => {
    ddbMock.on(GetCommand).resolves({});

    const res = await getStats("nope");

    expect(res.statusCode).to.equal(404);
    expectCors(res);
    expect(parseBody(res)).to.deep.equal({ error: "URL not found" });
  });

  it("returns 400 when the path has no short code", async () => {
    const res = await main({});

    expect(res.statusCode).to.equal(400);
    expect(parseBody(res).error).to.equal("Short code is required");
  });

  // Security: internal error details must not reach the caller.
  it("returns 500 with a generic message when the lookup fails", async () => {
    ddbMock.on(GetCommand).rejects(new Error("DynamoDB unavailable"));

    const res = await getStats("abc123");

    expect(res.statusCode).to.equal(500);
    expectCors(res);
    expect(parseBody(res)).to.deep.equal({ error: "Internal Server Error" });
  });
});
