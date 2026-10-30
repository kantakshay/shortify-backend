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
    it("returns an 8-char hex code, its full short URL, and saves the URL under it", async () => {
      ddbMock.on(PutCommand).resolves({});

      const result = await createShortUrl({ url: "https://example.com/page" });

      expect(result.short_code).to.match(/^[0-9a-f]{8}$/);
      expect(result.short_url).to.equal(`https://short.test/dev/${result.short_code}`);
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
      expect(result.short_url).to.equal("https://short.test/dev/mycode1");
      expect(savedItems()[0].short_code).to.equal("mycode1");
    });

    it("uses a random code when customCode is an empty string", async () => {
      ddbMock.on(PutCommand).resolves({});

      const result = await createShortUrl({ url: "https://example.com", customCode: "" });

      expect(result.short_code).to.match(/^[0-9a-f]{8}$/);
    });

    // Regression test for Bug 2: a taken custom code used to surface as a 500.
    it("throws a 409 when the custom code is already taken", async () => {
      ddbMock.on(PutCommand).rejects(conditionalCheckFailed());

      const err = await catchError(
        createShortUrl({ url: "https://example.com", customCode: "promo" }),
      );

      expect(err.statusCode).to.equal(409);
      expect(err.message).to.equal("Custom code already taken");
      expect(savedItems()).to.have.lengthOf(1);
    });

    const invalidCodes = [
      ["is not a string", 12345, "Custom code must be a string"],
      ["is only spaces", "   ", "Custom code cannot be empty"],
      ["is shorter than 3 chars", "ab", "Custom code must be between 3 and 20 characters"],
      [
        "is longer than 20 chars",
        "a".repeat(21),
        "Custom code must be between 3 and 20 characters",
      ],
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

describe("create-url service: BASE_URL", () => {
  const servicePath = require.resolve("../service");
  let ddbMock;

  before(() => {
    ddbMock = mockClient(DynamoDBDocumentClient);
    ddbMock.on(PutCommand).resolves({});
  });

  after(() => {
    ddbMock.restore();
  });

  // Loads a fresh copy of ../service with the given BASE_URL (undefined = unset),
  // then puts the env var and the module cache back.
  const loadWithBaseUrl = (value) => {
    const saved = process.env.BASE_URL;
    if (value === undefined) delete process.env.BASE_URL;
    else process.env.BASE_URL = value;
    delete require.cache[servicePath];

    try {
      return require(servicePath);
    } finally {
      process.env.BASE_URL = saved;
      delete require.cache[servicePath];
    }
  };

  it("drops a trailing slash so short_url has no double slash", async () => {
    const service = loadWithBaseUrl("https://short.test/dev/");

    const result = await service.createShortUrl({
      url: "https://example.com",
      customCode: "promo",
    });

    expect(result.short_url).to.equal("https://short.test/dev/promo");
  });

  it("throws at load time when BASE_URL is not set", () => {
    expect(() => loadWithBaseUrl(undefined)).to.throw("BASE_URL is not defined");
  });
});

describe("create-url service: expiresAt", () => {
  let ddbMock;

  before(() => {
    ddbMock = mockClient(DynamoDBDocumentClient);
  });

  beforeEach(() => {
    ddbMock.reset();
    ddbMock.on(PutCommand).resolves({});
  });

  after(() => {
    ddbMock.restore();
  });

  silenceConsole();

  const savedItems = () => ddbMock.commandCalls(PutCommand).map((call) => call.args[0].input.Item);
  const inOneDay = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  it("stores no expiry when expiresAt is not given", async () => {
    const result = await createShortUrl({ url: "https://example.com" });

    expect(savedItems()[0]).to.not.have.property("expires_at");
    expect(result).to.not.have.property("expires_at");
  });

  it("treats a null expiresAt like no expiry", async () => {
    const result = await createShortUrl({ url: "https://example.com", expiresAt: null });

    expect(savedItems()[0]).to.not.have.property("expires_at");
    expect(result).to.not.have.property("expires_at");
  });

  it("stores expiresAt in epoch seconds and returns it as an ISO date", async () => {
    const expiresAt = inOneDay();
    const seconds = Math.floor(Date.parse(expiresAt) / 1000);

    const result = await createShortUrl({ url: "https://example.com", expiresAt });

    expect(savedItems()[0].expires_at).to.equal(seconds);
    expect(result.expires_at).to.equal(new Date(seconds * 1000).toISOString());
  });

  it("applies the expiry to custom codes too", async () => {
    const expiresAt = inOneDay();

    const result = await createShortUrl({
      url: "https://example.com",
      customCode: "sale",
      expiresAt,
    });

    expect(savedItems()[0]).to.include({
      short_code: "sale",
      expires_at: Math.floor(Date.parse(expiresAt) / 1000),
    });
    expect(result.short_code).to.equal("sale");
  });

  const invalidExpiries = [
    ["is a number", 1798761599, "expiresAt must be a date string, e.g. 2026-12-31T23:59:59Z"],
    ["is not a date", "next friday", "expiresAt must be a date string, e.g. 2026-12-31T23:59:59Z"],
    ["is in the past", "2020-01-01T00:00:00Z", "expiresAt must be in the future"],
  ];

  invalidExpiries.forEach(([label, expiresAt, message]) => {
    it(`throws a 400 when expiresAt ${label}`, async () => {
      const err = await catchError(createShortUrl({ url: "https://example.com", expiresAt }));

      expect(err.statusCode).to.equal(400);
      expect(err.message).to.equal(message);
      expect(savedItems()).to.have.lengthOf(0);
    });
  });
});
