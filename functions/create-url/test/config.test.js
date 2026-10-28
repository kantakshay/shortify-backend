const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const config = yaml.load(
  fs.readFileSync(path.join(__dirname, "../../../serverless/functions.yml"), "utf8")
);
const iam = yaml.load(
  fs.readFileSync(path.join(__dirname, "../../../serverless/iam-resources.yml"), "utf8")
);
const URL_TABLE_ARN = { "Fn::GetAtt": ["UrlTable", "Arn"] };
const workflow = yaml.load(
  fs.readFileSync(path.join(__dirname, "../../../.github/workflows/deploy-dev.yml"), "utf8")
);
const testWorkflow = yaml.load(
  fs.readFileSync(path.join(__dirname, "../../../.github/workflows/test.yml"), "utf8")
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

  // Security: the Lambda role must not reach every DynamoDB table in the account.
  it("allows dynamodb:PutItem on the URL table only", () => {
    const statements = iam.statements.filter((s) => s.Action.includes("dynamodb:PutItem"));

    expect(statements).to.not.be.empty;
    statements.forEach((s) => expect(s.Resource).to.deep.equal(URL_TABLE_ARN));
  });

  // Security: /shorten is public, so the dev stage is throttled after every deploy.
  it("throttles the dev stage right after deploying", () => {
    const steps = workflow.jobs.deploy.steps;
    const deployIndex = steps.findIndex((s) => s.name === "Deploy to AWS (dev)");
    const throttleIndex = steps.findIndex((s) => s.name === "Set API throttling (dev)");

    expect(throttleIndex).to.equal(deployIndex + 1);
    const throttle = steps[throttleIndex];
    expect(throttle.env).to.deep.equal({ RATE_LIMIT: 10, BURST_LIMIT: 20 });
    expect(throttle.run).to.include("update-stage");
    expect(throttle.run).to.include("--stage-name dev");
  });

  it("runs the unit tests before deploying", () => {
    const steps = workflow.jobs.deploy.steps;
    const testIndex = steps.findIndex((s) => s.run === "npm test");
    const deployIndex = steps.findIndex((s) => s.name === "Deploy to AWS (dev)");

    expect(testIndex).to.be.at.least(0);
    expect(testIndex).to.be.below(deployIndex);
  });

  it("runs the unit tests on pull requests", () => {
    expect(testWorkflow.on).to.have.property("pull_request");
    expect(testWorkflow.jobs.test.steps.map((s) => s.run)).to.include("npm test");
  });
});
