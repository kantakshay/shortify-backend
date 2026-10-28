const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const config = yaml.load(
  fs.readFileSync(path.join(__dirname, "../../../serverless/functions.yml"), "utf8")
);

describe("analytics config (serverless/functions.yml)", () => {
  const { events } = config.functions.analytics;

  it("exposes GET /analytics/{short_code}", () => {
    expect(events).to.deep.include({
      http: { path: "/analytics/{short_code}", method: "get", cors: true },
    });
  });

  // Regression test for Bug 3: API Gateway only answers CORS preflights when cors is on.
  it("enables CORS on every http event", () => {
    events.forEach(({ http }) => expect(http.cors).to.equal(true));
  });
});
