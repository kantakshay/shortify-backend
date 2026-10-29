const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const config = yaml.load(
  fs.readFileSync(path.join(__dirname, "../../../serverless/functions.yml"), "utf8"),
);
const serverlessConfig = yaml.load(
  fs.readFileSync(path.join(__dirname, "../../../serverless.yml"), "utf8"),
);
const URL_TABLE_ARN = { "Fn::GetAtt": ["UrlTable", "Arn"] };

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

  // Lambda zips get the shared code, but never test files.
  it("packages shared code without any tests", () => {
    const { patterns } = config.functions.analytics.package;

    expect(patterns).to.include("shared/**");
    expect(patterns.indexOf("!functions/analytics/test/**")).to.be.above(
      patterns.indexOf("functions/analytics/**"),
    );
    expect(patterns.indexOf("!shared/test/**")).to.be.above(patterns.indexOf("shared/**"));
  });

  // Security: this Lambda has its own IAM role, so it can't use the others' permissions.
  it("runs with its own IAM role", () => {
    expect(serverlessConfig.provider.iam.role).to.deep.equal({ mode: "perFunction" });
  });

  // Security: least privilege, it only reads, on the URL table only.
  it("may only GetItem on the URL table", () => {
    const { statements } = config.functions.analytics.iam.role;

    expect(statements).to.deep.equal([
      { Effect: "Allow", Action: ["dynamodb:GetItem"], Resource: URL_TABLE_ARN },
    ]);
  });
});
