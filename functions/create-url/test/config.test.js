const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const config = yaml.load(
  fs.readFileSync(path.join(__dirname, "../../../serverless/functions.yml"), "utf8")
);

describe("create-url config (serverless/functions.yml)", () => {
  const { events } = config.functions.createUrl;

  it("exposes POST /shorten", () => {
    expect(events).to.deep.include({ http: { path: "/shorten", method: "post", cors: true } });
  });

  // Regression test for Bug 3: without cors, API Gateway rejects the browser's
  // OPTIONS preflight for this JSON POST.
  it("enables CORS on every http event", () => {
    events.forEach(({ http }) => expect(http.cors).to.equal(true));
  });
});
