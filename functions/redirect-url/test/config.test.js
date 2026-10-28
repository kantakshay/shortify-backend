const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const config = yaml.load(
  fs.readFileSync(path.join(__dirname, "../../../serverless/functions.yml"), "utf8"),
);
const iam = yaml.load(
  fs.readFileSync(path.join(__dirname, "../../../serverless/iam-resources.yml"), "utf8"),
);
const URL_TABLE_ARN = { "Fn::GetAtt": ["UrlTable", "Arn"] };

describe("redirect-url config (serverless/functions.yml)", () => {
  const { events } = config.functions.redirect;

  it("exposes GET /{short_code}", () => {
    expect(events).to.deep.include({ http: { path: "/{short_code}", method: "get", cors: true } });
  });

  // Regression test for Bug 3: API Gateway only answers CORS preflights when cors is on.
  it("enables CORS on every http event", () => {
    events.forEach(({ http }) => expect(http.cors).to.equal(true));
  });

  // Lambda zips get the shared code, but never test files.
  it("packages shared code without any tests", () => {
    const { patterns } = config.functions.redirect.package;

    expect(patterns).to.include("shared/**");
    expect(patterns.indexOf("!functions/redirect-url/test/**")).to.be.above(
      patterns.indexOf("functions/redirect-url/**"),
    );
    expect(patterns.indexOf("!shared/test/**")).to.be.above(patterns.indexOf("shared/**"));
  });

  // Security: the Lambda role must not reach every DynamoDB table in the account.
  ["dynamodb:GetItem", "dynamodb:UpdateItem"].forEach((action) => {
    it(`allows ${action} on the URL table only`, () => {
      const statements = iam.statements.filter((s) => s.Action.includes(action));

      expect(statements).to.not.be.empty;
      statements.forEach((s) => expect(s.Resource).to.deep.equal(URL_TABLE_ARN));
    });
  });
});
