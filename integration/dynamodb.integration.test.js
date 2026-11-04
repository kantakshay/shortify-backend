// Runs the real lambda code against DynamoDB Local (see setup.js). The unit
// tests mock DynamoDB, so they only check that we *send* the right expressions;
// these check that DynamoDB actually enforces them. A typo such as
// attribute_not_exists(short_cde) passes every mocked test but fails here.

const { expect } = require("chai");
const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");

const { dynamo, TABLE_NAME } = require("../shared/dynamo");
const { nowInSeconds } = require("../shared/expiry");
const saveUrl = require("../functions/create-url/dynamoDB");
const { createShortUrl } = require("../functions/create-url/service");
const { incrementClicks } = require("../functions/redirect-url/dynamoDB");
const { getLongUrl } = require("../functions/redirect-url/service");
const { getAnalytics } = require("../functions/analytics/service");

const getItem = async (shortCode) =>
  (await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { short_code: shortCode } })))
    .Item;

const catchError = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("Expected the promise to reject, but it resolved");
};

describe("integration: DynamoDB Local", function () {
  this.timeout(20000);

  // incrementClicks logs the failures it swallows; keep the output readable
  const original = {};
  beforeEach(() => {
    original.error = console.error;
    console.error = () => {};
  });
  afterEach(() => {
    console.error = original.error;
  });

  // Security: a code is never overwritten, so a link can't be hijacked
  it("refuses to save the same code twice and keeps the first link", async () => {
    await saveUrl("twice1", "https://example.com/first");

    const err = await catchError(saveUrl("twice1", "https://evil.example/second"));

    expect(err.name).to.equal("ConditionalCheckFailedException");
    expect((await getItem("twice1")).long_url).to.equal("https://example.com/first");
  });

  // A click on an unknown code (bots, typos) must not create a junk item
  it("does not create an item when a click is counted for an unknown code", async () => {
    await incrementClicks("ghost1");

    expect(await getItem("ghost1")).to.equal(undefined);
  });

  // Codes are never reused, even after expiry: old flyers and QR codes must
  // not start pointing somewhere new
  it("keeps an expired link and refuses its code as a custom code (409)", async () => {
    // Written directly: the service only accepts future expiry dates
    await dynamo.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          short_code: "oldpromo",
          long_url: "https://example.com/old",
          created_at: "2026-01-01T00:00:00.000Z",
          expires_at: nowInSeconds() - 60,
        },
      }),
    );

    const notFound = await catchError(getLongUrl("oldpromo"));
    const taken = await catchError(
      createShortUrl({ url: "https://evil.example/new", customCode: "oldpromo" }),
    );

    expect(notFound.statusCode).to.equal(404);
    expect(taken.statusCode).to.equal(409);
    expect((await getItem("oldpromo")).long_url).to.equal("https://example.com/old");
  });

  // The counter is updated inside DynamoDB in one step, so clicks that arrive
  // at the same moment are all counted (no lost updates)
  it("counts 50 clicks made at the same time as exactly 50", async () => {
    await saveUrl("busy1", "https://example.com/busy");

    await Promise.all(Array.from({ length: 50 }, () => incrementClicks("busy1")));

    const item = await getItem("busy1");
    expect(item.clicks).to.equal(50);
    expect(item.last_clicked_at).to.be.a("string");
  });

  it("creates, redirects and reports a link end to end", async () => {
    const { short_code: code } = await createShortUrl({ url: "https://example.com/page" });

    expect(await getLongUrl(code)).to.equal("https://example.com/page");
    expect(await getLongUrl(code.toUpperCase())).to.equal("https://example.com/page");

    const stats = await getAnalytics(code);
    expect(stats).to.include({ short_code: code, long_url: "https://example.com/page", clicks: 2 });
    expect(stats.last_clicked_at).to.be.a("string");
  });
});
