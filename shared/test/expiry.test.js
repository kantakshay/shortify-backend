const { expect } = require("chai");

const { nowInSeconds, isExpired } = require("../expiry");

describe("shared expiry helpers", () => {
  it("nowInSeconds returns the current time in whole epoch seconds", () => {
    const before = Math.floor(Date.now() / 1000);
    const now = nowInSeconds();

    expect(Number.isInteger(now)).to.equal(true);
    expect(now).to.be.within(before, before + 1);
  });

  describe("isExpired", () => {
    it("is false for a link with no expiry", () => {
      expect(isExpired({ short_code: "abc123" })).to.equal(false);
    });

    it("is false while the expiry is in the future", () => {
      expect(isExpired({ expires_at: nowInSeconds() + 60 })).to.equal(false);
    });

    it("is true once the expiry has passed", () => {
      expect(isExpired({ expires_at: nowInSeconds() - 1 })).to.equal(true);
    });

    it("is true at the exact expiry second", () => {
      expect(isExpired({ expires_at: nowInSeconds() })).to.equal(true);
    });
  });
});
