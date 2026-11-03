const {
  conditionalCheckFailed,
  silenceConsole,
  recordConsole,
  expectCors,
  parseBody,
} = require("./helpers");

const { expect } = require("chai");
const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const { main } = require("../handler");

const post = (body) => main({ body: JSON.stringify(body) });

describe("create-url handler (POST /shorten)", () => {
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

  it("returns 201 Created with a JSON body and CORS headers", async () => {
    ddbMock.on(PutCommand).resolves({});

    const res = await post({ url: "https://example.com" });

    expect(res.statusCode).to.equal(201);
    expect(res.headers["Content-Type"]).to.equal("application/json");
    expectCors(res);
    expect(parseBody(res)).to.have.keys("short_code", "short_url");
  });

  it("passes the parsed body to the service", async () => {
    ddbMock.on(PutCommand).resolves({});

    const res = await post({ url: "https://example.com", customCode: "promo" });

    expect(parseBody(res).short_code).to.equal("promo");
  });

  it("returns the service's status code and message for expected errors", async () => {
    const res = await post({ url: "https://example.com", customCode: "ab" });

    expect(res.statusCode).to.equal(400);
    expectCors(res);
    expect(parseBody(res)).to.deep.equal({
      error: "Custom code must be between 3 and 20 characters",
    });
  });

  // Regression test for Bug 2: a taken custom code used to come back as a 500.
  it("returns 409 when the custom code is already taken", async () => {
    ddbMock.on(PutCommand).rejects(conditionalCheckFailed());

    const res = await post({ url: "https://example.com", customCode: "promo" });

    expect(res.statusCode).to.equal(409);
    expectCors(res);
    expect(parseBody(res).error).to.equal("Custom code already taken");
  });

  // Security: internal error details must not reach the caller.
  it("returns 500 with a generic message for unexpected errors", async () => {
    ddbMock.on(PutCommand).rejects(new Error("Throughput exceeded"));

    const res = await post({ url: "https://example.com" });

    expect(res.statusCode).to.equal(500);
    expectCors(res);
    expect(parseBody(res)).to.deep.equal({ error: "Internal Server Error" });
  });

  it("keeps its own message for expected 500s", async () => {
    ddbMock.on(PutCommand).rejects(conditionalCheckFailed());

    const res = await post({ url: "https://example.com" });

    expect(res.statusCode).to.equal(500);
    expect(parseBody(res).error).to.equal("Failed to generate unique short code");
  });

  // Security: the full request (headers, source IP, body) must not be logged.
  it("does not log the request", async () => {
    // First request succeeds, second fails with a 409, so both paths are covered
    ddbMock.on(PutCommand).resolvesOnce({}).rejects(conditionalCheckFailed());
    const logs = recordConsole();
    const event = (body) => ({
      headers: { "X-Forwarded-For": "203.0.113.7" },
      requestContext: { identity: { sourceIp: "203.0.113.7" } },
      body: JSON.stringify(body),
    });

    await main(event({ url: "https://example.com/private-page" }));
    await main(event({ url: "https://example.com/private-page", customCode: "taken1" }));

    expect(logs.warn).to.have.lengthOf(1);
    const output = JSON.stringify(logs);
    expect(output).to.not.include("203.0.113.7");
    expect(output).to.not.include("private-page");
  });

  // Regression test for Bug 4: this response used to have no CORS headers.
  it("returns 400 with CORS headers for a body that is not valid JSON", async () => {
    const res = await main({ body: "{not json" });

    expect(res.statusCode).to.equal(400);
    expectCors(res);
    expect(parseBody(res).error).to.equal("Invalid JSON body");
  });

  it("treats a missing body as empty and returns 400", async () => {
    const res = await main({});

    expect(res.statusCode).to.equal(400);
    expect(ddbMock.commandCalls(PutCommand)).to.have.lengthOf(0);
  });

  // Regression tests for Bug 5: a null body used to crash the service with a 500.
  const nonObjectBodies = [
    ["null", "null"],
    ["an array", "[]"],
    ["a string", '"https://example.com"'],
    ["a number", "42"],
  ];

  nonObjectBodies.forEach(([label, rawBody]) => {
    it(`returns 400 when the body is ${label}`, async () => {
      const res = await main({ body: rawBody });

      expect(res.statusCode).to.equal(400);
      expectCors(res);
      expect(parseBody(res).error).to.equal("Request body must be a JSON object");
      expect(ddbMock.commandCalls(PutCommand)).to.have.lengthOf(0);
    });
  });
});

describe("create-url handler: expiresAt", () => {
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

  it("returns the expiry in the 201 response", async () => {
    ddbMock.on(PutCommand).resolves({});
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const res = await post({ url: "https://example.com", expiresAt });

    expect(res.statusCode).to.equal(201);
    const expected = new Date(Math.floor(Date.parse(expiresAt) / 1000) * 1000).toISOString();
    expect(parseBody(res).expires_at).to.equal(expected);
  });

  it("returns 400 for an expiry in the past", async () => {
    const res = await post({ url: "https://example.com", expiresAt: "2020-01-01T00:00:00Z" });

    expect(res.statusCode).to.equal(400);
    expectCors(res);
    expect(parseBody(res).error).to.equal("expiresAt must be in the future");
    expect(ddbMock.commandCalls(PutCommand)).to.have.lengthOf(0);
  });

  // Without a timezone the same request would mean a different moment per server
  it("returns 400 for an expiry without a timezone", async () => {
    const res = await post({ url: "https://example.com", expiresAt: "2099-12-31T23:59:59" });

    expect(res.statusCode).to.equal(400);
    expectCors(res);
    expect(parseBody(res).error).to.equal(
      "expiresAt must be an ISO date with a timezone, e.g. 2026-12-31T23:59:59Z",
    );
    expect(ddbMock.commandCalls(PutCommand)).to.have.lengthOf(0);
  });
});

// ERROR must mean "something is broken": user mistakes and normal collisions
// are logged as WARN (or not at all), real failures as ERROR.
describe("create-url handler: logging", () => {
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

  it("logs a 400 (bad input) as WARN, not ERROR", async () => {
    const logs = recordConsole();

    await post({ url: "not-a-url" });

    expect(logs.error).to.have.lengthOf(0);
    expect(logs.warn).to.deep.equal([["[create-url] 400: Invalid URL format"]]);
  });

  it("logs a taken custom code (409) as one WARN line only", async () => {
    ddbMock.on(PutCommand).rejects(conditionalCheckFailed());
    const logs = recordConsole();

    await post({ url: "https://example.com", customCode: "promo" });

    expect(logs.error).to.have.lengthOf(0);
    expect(logs.warn).to.deep.equal([["[create-url] 409: Custom code already taken"]]);
  });

  it("logs nothing when a random-code collision is retried successfully", async () => {
    ddbMock.on(PutCommand).rejectsOnce(conditionalCheckFailed()).resolves({});
    const logs = recordConsole();

    const res = await post({ url: "https://example.com" });

    expect(res.statusCode).to.equal(201);
    expect(logs.error).to.have.lengthOf(0);
    expect(logs.warn).to.have.lengthOf(0);
  });

  it("logs a real DynamoDB failure (500) as ERROR", async () => {
    ddbMock.on(PutCommand).rejects(new Error("DynamoDB unavailable"));
    const logs = recordConsole();

    const res = await post({ url: "https://example.com" });

    expect(res.statusCode).to.equal(500);
    expect(logs.warn).to.have.lengthOf(0);
    expect(logs.error.map((args) => args[0])).to.deep.equal([
      "[DynamoDB ERROR]",
      "[create-url] Unexpected error:",
    ]);
  });

  it("logs giving up after 5 collisions (500) as ERROR", async () => {
    ddbMock.on(PutCommand).rejects(conditionalCheckFailed());
    const logs = recordConsole();

    await post({ url: "https://example.com" });

    expect(logs.error).to.have.lengthOf(1);
    expect(logs.error[0][0]).to.equal("[create-url] Unexpected error:");
  });
});
