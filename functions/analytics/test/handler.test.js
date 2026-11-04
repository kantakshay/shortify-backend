const { silenceConsole, recordConsole, expectCors, parseBody } = require("./helpers");

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

// ERROR must mean "something is broken": a wrong or expired code is the
// caller's mistake, not a failure.
describe("analytics handler: logging", () => {
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

  it("logs an unknown code (404) as WARN, not ERROR", async () => {
    ddbMock.on(GetCommand).resolves({});
    const logs = recordConsole();

    await getStats("nope");

    expect(logs.error).to.have.lengthOf(0);
    expect(logs.warn).to.deep.equal([["[analytics] 404: URL not found"]]);
  });

  it("logs a missing short code (400) as WARN, not ERROR", async () => {
    const logs = recordConsole();

    await main({});

    expect(logs.error).to.have.lengthOf(0);
    expect(logs.warn).to.deep.equal([["[analytics] 400: Short code is required"]]);
  });

  it("logs a failed lookup (500) as ERROR", async () => {
    ddbMock.on(GetCommand).rejects(new Error("DynamoDB unavailable"));
    const logs = recordConsole();

    await getStats("abc123");

    expect(logs.warn).to.have.lengthOf(0);
    expect(logs.error).to.have.lengthOf(1);
    expect(logs.error[0][0]).to.equal("[analytics] Unexpected error:");
  });
});

// A 500 hides the real error, so the Lambda request ID is what a caller can
// report; the same ID must be in the ERROR line so we can find it.
describe("analytics handler: request ID", () => {
  const context = { awsRequestId: "req-123" };
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

  it("returns the request ID in a 500 and logs it in the ERROR line", async () => {
    ddbMock.on(GetCommand).rejects(new Error("DynamoDB unavailable"));
    const logs = recordConsole();

    const res = await main({ pathParameters: { short_code: "abc123" } }, context);

    expect(res.statusCode).to.equal(500);
    expect(parseBody(res)).to.deep.equal({
      error: "Internal Server Error",
      requestId: "req-123",
    });
    expect(logs.error[0][0]).to.equal("[analytics] Unexpected error (requestId=req-123):");
  });

  it("does not return the request ID in a 404", async () => {
    ddbMock.on(GetCommand).resolves({});

    const res = await main({ pathParameters: { short_code: "nope" } }, context);

    expect(res.statusCode).to.equal(404);
    expect(parseBody(res)).to.deep.equal({ error: "URL not found" });
  });

  it("does not return the request ID in a 400", async () => {
    const res = await main({}, context);

    expect(res.statusCode).to.equal(400);
    expect(parseBody(res)).to.not.have.property("requestId");
  });

  it("still returns a clean 500 when there is no context", async () => {
    ddbMock.on(GetCommand).rejects(new Error("DynamoDB unavailable"));

    const res = await main({ pathParameters: { short_code: "abc123" } });

    expect(res.statusCode).to.equal(500);
    expect(parseBody(res)).to.deep.equal({ error: "Internal Server Error" });
  });
});
