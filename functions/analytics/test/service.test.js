const { catchError } = require("./helpers");

const { expect } = require("chai");
const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const { getAnalytics } = require("../service");

describe("analytics service: getAnalytics", () => {
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

  // Analytics step 1: created_at and last_clicked_at are returned
  it("returns the code, URL, clicks, created and last-clicked dates", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        short_code: "abc123",
        long_url: "https://example.com",
        clicks: 42,
        created_at: "2026-10-28T00:00:00.000Z",
        last_clicked_at: "2026-10-30T09:15:00.000Z",
        internal_field: "not for callers",
      },
    });

    const stats = await getAnalytics("abc123");

    expect(stats).to.deep.equal({
      short_code: "abc123",
      long_url: "https://example.com",
      clicks: 42,
      created_at: "2026-10-28T00:00:00.000Z",
      last_clicked_at: "2026-10-30T09:15:00.000Z",
    });
  });

  it("reports 0 clicks and a null last_clicked_at for a code never visited", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        short_code: "fresh1",
        long_url: "https://example.com",
        created_at: "2026-10-28T00:00:00.000Z",
      },
    });

    const stats = await getAnalytics("fresh1");

    expect(stats.clicks).to.equal(0);
    expect(stats.last_clicked_at).to.be.null;
  });

  // Links clicked before last_clicked_at existed have clicks but no click time
  it("returns a null last_clicked_at for an older link with clicks but no click time", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        short_code: "old1",
        long_url: "https://example.com",
        clicks: 7,
        created_at: "2026-10-01T00:00:00.000Z",
      },
    });

    const stats = await getAnalytics("old1");

    expect(stats.clicks).to.equal(7);
    expect(stats.last_clicked_at).to.be.null;
  });

  it("returns a null created_at for an item without one", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { short_code: "nodate", long_url: "https://example.com" },
    });

    const stats = await getAnalytics("nodate");

    expect(stats.created_at).to.be.null;
  });

  it("throws a 404 for an unknown code", async () => {
    ddbMock.on(GetCommand).resolves({});

    const err = await catchError(getAnalytics("nope"));

    expect(err.statusCode).to.equal(404);
    expect(err.message).to.equal("URL not found");
  });

  it("throws a 400 when the short code is missing", async () => {
    const err = await catchError(getAnalytics(undefined));

    expect(err.statusCode).to.equal(400);
    expect(err.message).to.equal("Short code is required");
    expect(ddbMock.commandCalls(GetCommand)).to.have.lengthOf(0);
  });

  it("rethrows lookup failures", async () => {
    ddbMock.on(GetCommand).rejects(new Error("DynamoDB unavailable"));

    const err = await catchError(getAnalytics("abc123"));

    expect(err.message).to.equal("DynamoDB unavailable");
    expect(err.statusCode).to.be.undefined;
  });

  // Regression test for Bug 7: /analytics/MyCode used to 404 because codes are stored lowercase.
  it("looks up mixed-case codes in lowercase", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { short_code: "mycode", long_url: "https://example.com", clicks: 2 },
    });

    const stats = await getAnalytics("MyCode");

    expect(stats.short_code).to.equal("mycode");
    const input = ddbMock.commandCalls(GetCommand)[0].args[0].input;
    expect(input.Key).to.deep.equal({ short_code: "mycode" });
  });
});

describe("analytics service: expired links", () => {
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

  const inSeconds = (offset) => Math.floor(Date.now() / 1000) + offset;

  // Expiry: expired links stay in the table, so analytics must check the date itself.
  it("throws a 404 for an expired link", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { short_code: "sale", long_url: "https://example.com", expires_at: inSeconds(-60) },
    });

    const err = await catchError(getAnalytics("sale"));

    expect(err.statusCode).to.equal(404);
    expect(err.message).to.equal("URL not found");
  });

  it("includes expires_at as an ISO date for a link that expires", async () => {
    const expiresAt = inSeconds(3600);
    ddbMock.on(GetCommand).resolves({
      Item: {
        short_code: "sale",
        long_url: "https://example.com",
        clicks: 3,
        created_at: "2026-10-28T00:00:00.000Z",
        last_clicked_at: "2026-10-29T12:00:00.000Z",
        expires_at: expiresAt,
      },
    });

    const stats = await getAnalytics("sale");

    expect(stats).to.deep.equal({
      short_code: "sale",
      long_url: "https://example.com",
      clicks: 3,
      created_at: "2026-10-28T00:00:00.000Z",
      last_clicked_at: "2026-10-29T12:00:00.000Z",
      expires_at: new Date(expiresAt * 1000).toISOString(),
    });
  });
});
