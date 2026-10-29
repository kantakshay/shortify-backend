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

  // Security: this Lambda has its own IAM role, so it can't use the others' permissions.
  it("runs with its own IAM role", () => {
    expect(serverlessConfig.provider.iam.role).to.deep.equal({ mode: "perFunction" });
  });

  // Security: least privilege, it reads the link and updates its click counter, on the URL table only.
  it("may only GetItem and UpdateItem on the URL table", () => {
    const { statements } = config.functions.redirect.iam.role;

    expect(statements).to.deep.equal([
      {
        Effect: "Allow",
        Action: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
        Resource: URL_TABLE_ARN,
      },
    ]);
  });
});
