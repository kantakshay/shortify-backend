const { conditionalCheckFailed, silenceConsole, expectCors, parseBody } = require("./helpers");

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

  it("returns 200 with a JSON body and CORS headers", async () => {
    ddbMock.on(PutCommand).resolves({});

    const res = await post({ url: "https://example.com" });

    expect(res.statusCode).to.equal(200);
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
    expect(parseBody(res)).to.deep.equal({ error: "Custom code must be between 3 and 20 characters" });
  });

  // Regression test for Bug 2: a taken custom code used to come back as a 500.
  it("returns 409 when the custom code is already taken", async () => {
    ddbMock.on(PutCommand).rejects(conditionalCheckFailed());

    const res = await post({ url: "https://example.com", customCode: "promo" });

    expect(res.statusCode).to.equal(409);
    expectCors(res);
    expect(parseBody(res).error).to.equal("Custom code already taken");
  });

  it("returns 500 for unexpected errors", async () => {
    ddbMock.on(PutCommand).rejects(new Error("Throughput exceeded"));

    const res = await post({ url: "https://example.com" });

    expect(res.statusCode).to.equal(500);
    expectCors(res);
    expect(parseBody(res)).to.have.property("error");
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
