const { expect } = require("chai");

const { CORS_HEADERS, jsonResponse, errorToResponse, redirectResponse } = require("../response");

describe("shared response helpers", () => {
  describe("jsonResponse", () => {
    it("returns the status code, JSON content type, CORS headers and body", () => {
      const res = jsonResponse(200, { short_code: "abc123" });

      expect(res.statusCode).to.equal(200);
      expect(res.headers).to.deep.equal({ "Content-Type": "application/json", ...CORS_HEADERS });
      expect(JSON.parse(res.body)).to.deep.equal({ short_code: "abc123" });
    });
  });

  describe("errorToResponse", () => {
    it("uses the error's status code and message for expected errors", () => {
      const err = new Error("URL not found");
      err.statusCode = 404;

      const res = errorToResponse(err);

      expect(res.statusCode).to.equal(404);
      expect(res.headers).to.include(CORS_HEADERS);
      expect(JSON.parse(res.body)).to.deep.equal({ error: "URL not found" });
    });

    it("keeps the message of an expected 500", () => {
      const err = new Error("Failed to generate unique short code");
      err.statusCode = 500;

      expect(JSON.parse(errorToResponse(err).body)).to.deep.equal({
        error: "Failed to generate unique short code",
      });
    });

    // Security: internal error details must not reach the caller.
    it("hides the message of unexpected errors behind a generic 500", () => {
      const res = errorToResponse(new Error("connect ECONNREFUSED 10.0.0.12:443"));

      expect(res.statusCode).to.equal(500);
      expect(JSON.parse(res.body)).to.deep.equal({ error: "Internal Server Error" });
    });

    // A 500 hides the real error, so the request ID is the only thing a caller
    // can report to help us find the exact log lines.
    describe("request ID", () => {
      it("adds the request ID to an unexpected 500", () => {
        const res = errorToResponse(new Error("AccessDeniedException"), "req-123");

        expect(res.statusCode).to.equal(500);
        expect(JSON.parse(res.body)).to.deep.equal({
          error: "Internal Server Error",
          requestId: "req-123",
        });
      });

      it("adds the request ID to an expected 500", () => {
        const err = new Error("Failed to generate unique short code");
        err.statusCode = 500;

        expect(JSON.parse(errorToResponse(err, "req-123").body)).to.deep.equal({
          error: "Failed to generate unique short code",
          requestId: "req-123",
        });
      });

      [400, 404, 409].forEach((statusCode) => {
        it(`does not add the request ID to a ${statusCode}`, () => {
          const err = new Error("Expected problem");
          err.statusCode = statusCode;

          expect(JSON.parse(errorToResponse(err, "req-123").body)).to.deep.equal({
            error: "Expected problem",
          });
        });
      });

      it("leaves the field out when there is no request ID", () => {
        const body = JSON.parse(errorToResponse(new Error("boom")).body);

        expect(body).to.deep.equal({ error: "Internal Server Error" });
        expect(body).to.not.have.property("requestId");
      });
    });
  });

  describe("redirectResponse", () => {
    it("returns a 302 to the location with CORS headers and no body", () => {
      const res = redirectResponse("https://example.com/page");

      expect(res).to.deep.equal({
        statusCode: 302,
        headers: { ...CORS_HEADERS, Location: "https://example.com/page" },
      });
    });
  });
});
