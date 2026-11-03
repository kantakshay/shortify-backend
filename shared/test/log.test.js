const { expect } = require("chai");

const { logHandlerError } = require("../log");

const errorWithStatus = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

describe("shared log helper: logHandlerError", () => {
  const original = {};
  let calls;

  beforeEach(() => {
    original.warn = console.warn;
    original.error = console.error;
    calls = { warn: [], error: [] };
    console.warn = (...args) => calls.warn.push(args);
    console.error = (...args) => calls.error.push(args);
  });

  afterEach(() => {
    console.warn = original.warn;
    console.error = original.error;
  });

  // Expected errors are the caller's mistake, not a failure: they must not
  // show up as ERROR, or alarms and searches would be flooded with them.
  [
    ["a 400", "Invalid URL format", 400],
    ["a 404", "URL not found", 404],
    ["a 409", "Custom code already taken", 409],
  ].forEach(([label, message, statusCode]) => {
    it(`logs ${label} as one WARN line with the status and message`, () => {
      logHandlerError("create-url", errorWithStatus(message, statusCode));

      expect(calls.error).to.have.lengthOf(0);
      expect(calls.warn).to.deep.equal([[`[create-url] ${statusCode}: ${message}`]]);
    });
  });

  it("does not log a stack trace for expected errors", () => {
    logHandlerError("analytics", errorWithStatus("URL not found", 404));

    expect(JSON.stringify(calls.warn)).to.not.include("at ");
  });

  it("logs an error without a status code as ERROR, with the full error", () => {
    const err = new Error("AccessDeniedException");

    logHandlerError("redirect-url", err);

    expect(calls.warn).to.have.lengthOf(0);
    expect(calls.error).to.have.lengthOf(1);
    expect(calls.error[0][0]).to.equal("[redirect-url] Unexpected error:");
    expect(calls.error[0][1]).to.equal(err);
  });

  it("logs an expected 500 as ERROR", () => {
    logHandlerError("create-url", errorWithStatus("Failed to generate unique short code", 500));

    expect(calls.warn).to.have.lengthOf(0);
    expect(calls.error).to.have.lengthOf(1);
  });
});
