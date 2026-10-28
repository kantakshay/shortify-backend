const { conditionalCheckFailed, catchError, silenceConsole } = require("./helpers");

const { expect } = require("chai");
const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const { createShortUrl } = require("../service");

describe("create-url service: createShortUrl", () => {
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

  const savedItems = () => ddbMock.commandCalls(PutCommand).map((call) => call.args[0].input.Item);

  describe("random short code", () => {
    it("returns an 8-char hex code and saves the URL under it", async () => {
      ddbMock.on(PutCommand).resolves({});

      const result = await createShortUrl({ url: "https://example.com/page" });

      expect(result.short_code).to.match(/^[0-9a-f]{8}$/);
      expect(result.short_url).to.equal(result.short_code);
      expect(savedItems()).to.have.lengthOf(1);
      expect(savedItems()[0]).to.include({
        short_code: result.short_code,
        long_url: "https://example.com/page",
      });
    });

    it("saves the normalized URL", async () => {
      ddbMock.on(PutCommand).resolves({});

      await createShortUrl({ url: "HTTPS://Example.com" });

      expect(savedItems()[0].long_url).to.equal("https://example.com/");
    });

    // Regression test for Bug 2: a collision used to fail instead of retrying.
    it("retries with a new code after a collision", async () => {
      ddbMock.on(PutCommand).rejectsOnce(conditionalCheckFailed()).resolves({});

      const result = await createShortUrl({ url: "https://example.com" });

      const items = savedItems();
      expect(items).to.have.lengthOf(2);
      expect(result.short_code).to.equal(items[1].short_code);
    });

    it("gives up with a 500 after 5 collisions in a row", async () => {
      ddbMock.on(PutCommand).rejects(conditionalCheckFailed());

      const err = await catchError(createShortUrl({ url: "https://example.com" }));

      expect(err.statusCode).to.equal(500);
      expect(err.message).to.equal("Failed to generate unique short code");
      expect(savedItems()).to.have.lengthOf(5);
    });

    it("does not retry on other DynamoDB errors", async () => {
      ddbMock.on(PutCommand).rejects(new Error("Throughput exceeded"));

      const err = await catchError(createShortUrl({ url: "https://example.com" }));

      expect(err.message).to.equal("Throughput exceeded");
      expect(err.statusCode).to.be.undefined;
      expect(savedItems()).to.have.lengthOf(1);
    });
  });

  describe("custom code", () => {
    it("saves the custom code trimmed and lowercased", async () => {
      ddbMock.on(PutCommand).resolves({});

      const result = await createShortUrl({ url: "https://example.com", customCode: "  MyCode1 " });

      expect(result.short_code).to.equal("mycode1");
      expect(savedItems()[0].short_code).to.equal("mycode1");
    });

    // Regression test for Bug 2: a taken custom code used to surface as a 500.
    it("throws a 409 when the custom code is already taken", async () => {
      ddbMock.on(PutCommand).rejects(conditionalCheckFailed());

      const err = await catchError(createShortUrl({ url: "https://example.com", customCode: "promo" }));

      expect(err.statusCode).to.equal(409);
      expect(err.message).to.equal("Custom code already taken");
      expect(savedItems()).to.have.lengthOf(1);
    });

    const invalidCodes = [
      ["is not a string", 12345, "Custom code must be a string"],
      ["is only spaces", "   ", "Custom code cannot be empty"],
      ["is shorter than 3 chars", "ab", "Custom code must be between 3 and 20 characters"],
      ["is longer than 20 chars", "a".repeat(21), "Custom code must be between 3 and 20 characters"],
      ["has special characters", "my-code", "Custom code can only contain letters and numbers"],
    ];

    invalidCodes.forEach(([label, customCode, message]) => {
      it(`throws a 400 when the custom code ${label}`, async () => {
        const err = await catchError(createShortUrl({ url: "https://example.com", customCode }));

        expect(err.statusCode).to.equal(400);
        expect(err.message).to.equal(message);
        expect(savedItems()).to.have.lengthOf(0);
      });
    });
  });

  describe("URL validation", () => {
    it("throws a 400 for a malformed URL", async () => {
      const err = await catchError(createShortUrl({ url: "not-a-url" }));

      expect(err.statusCode).to.equal(400);
      expect(err.message).to.equal("Invalid URL format");
      expect(savedItems()).to.have.lengthOf(0);
    });

    // Regression test for Bug 6: this message used to be replaced by "Invalid URL format".
    it("throws a 400 with its own message for a non-HTTP URL", async () => {
      const err = await catchError(createShortUrl({ url: "ftp://example.com/file" }));

      expect(err.statusCode).to.equal(400);
      expect(err.message).to.equal("Only HTTP/HTTPS URLs are allowed");
      expect(savedItems()).to.have.lengthOf(0);
    });

    // Regression tests for Bug 6: a missing url used to fail as "Invalid URL format".
    [
      ["missing", {}],
      ["an empty string", { url: "" }],
      ["null", { url: null }],
    ].forEach(([label, body]) => {
      it(`throws a 400 'URL is required' when the url is ${label}`, async () => {
        const err = await catchError(createShortUrl(body));

        expect(err.statusCode).to.equal(400);
        expect(err.message).to.equal("URL is required");
        expect(savedItems()).to.have.lengthOf(0);
      });
    });
  });
});
