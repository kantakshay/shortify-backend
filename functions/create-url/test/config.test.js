require("./helpers");

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
const workflow = yaml.load(
  fs.readFileSync(path.join(__dirname, "../../../.github/workflows/deploy-dev.yml"), "utf8"),
);
const testWorkflow = yaml.load(
  fs.readFileSync(path.join(__dirname, "../../../.github/workflows/test.yml"), "utf8"),
);
const environment = yaml.load(
  fs.readFileSync(path.join(__dirname, "../../../serverless/environment.yml"), "utf8"),
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

  // Lambda zips get the shared code, but never test files.
  it("packages shared code without any tests", () => {
    const { patterns } = config.functions.createUrl.package;

    expect(patterns).to.include("shared/**");
    expect(patterns.indexOf("!functions/create-url/test/**")).to.be.above(
      patterns.indexOf("functions/create-url/**"),
    );
    expect(patterns.indexOf("!shared/test/**")).to.be.above(patterns.indexOf("shared/**"));
  });

  // Security: this Lambda has its own IAM role, so it can't use the others' permissions.
  it("runs with its own IAM role", () => {
    expect(serverlessConfig.provider.iam.role).to.deep.equal({ mode: "perFunction" });
  });

  // Security: least privilege, it only writes new links, on the URL table only.
  it("may only PutItem on the URL table", () => {
    const { statements } = config.functions.createUrl.iam.role;

    expect(statements).to.deep.equal([
      { Effect: "Allow", Action: ["dynamodb:PutItem"], Resource: URL_TABLE_ARN },
    ]);
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

  // Deploys stay manual and allowed from any branch; they're recorded under
  // the "dev" GitHub Environment, so its history shows what ran on dev.
  it("is a manual deploy from any branch, through the dev environment", () => {
    expect(workflow.on).to.have.property("workflow_dispatch");
    expect(workflow.jobs.deploy).to.not.have.property("if");
    expect(workflow.jobs.deploy.environment).to.equal("dev");
  });

  // npm install can pick newer versions than package-lock.json; npm ci
  // installs exactly what CI tested.
  it("installs the exact locked dependency versions with npm ci", () => {
    const runs = workflow.jobs.deploy.steps.map((s) => s.run);

    expect(runs).to.include("npm ci");
    expect(runs).to.not.include("npm install");
  });

  it("ends with a summary of the deployed branch and commit", () => {
    const steps = workflow.jobs.deploy.steps;
    const summary = steps[steps.length - 1];

    expect(summary.name).to.equal("Deployment summary");
    expect(summary.env).to.deep.equal({
      BRANCH: "${{ github.ref_name }}",
      COMMIT: "${{ github.sha }}",
    });
    expect(summary.run).to.include("$GITHUB_STEP_SUMMARY");
  });

  // Security: ${{ }} inside a script is pasted in as code, so a crafted branch
  // name could run shell commands. Values must reach scripts through env.
  it("never pastes ${{ }} expressions into deploy scripts", () => {
    workflow.jobs.deploy.steps
      .filter((s) => s.run)
      .forEach((s) => expect(s.run, s.name).to.not.include("${{"));
  });

  it("has a PR template with the testing and redeploy checklist", () => {
    const template = fs.readFileSync(
      path.join(__dirname, "../../../.github/pull_request_template.md"),
      "utf8",
    );

    [
      "## What changed",
      "## Why",
      "## How I tested",
      "- [ ] `npm test` passes locally",
      "- [ ] Deployed this branch to dev and tested in Postman",
      "## After merging",
      "- [ ] Redeployed `develop` to dev",
      "## Risks / follow-ups",
    ].forEach((line) => expect(template).to.include(line));
  });

  // short_url is built from BASE_URL, which must be this stage's API Gateway address.
  it("sets BASE_URL to the dev API Gateway URL", () => {
    expect(environment.dev.BASE_URL).to.deep.equal({
      "Fn::Join": [
        "",
        [
          "https://",
          { Ref: "ApiGatewayRestApi" },
          ".execute-api.",
          { Ref: "AWS::Region" },
          ".amazonaws.com/dev",
        ],
      ],
    });
  });

  // A custom code equal to a fixed top-level route could never be opened, so
  // every such route must be in the reserved list.
  it("reserves every fixed top-level API route as a custom code", () => {
    const { RESERVED_CODES } = require("../service");
    const topLevelRoutes = Object.values(config.functions)
      .flatMap((fn) => fn.events || [])
      .filter((event) => event.http)
      .map((event) => event.http.path.replace(/^\//, "").split("/")[0])
      .filter((segment) => segment && !segment.startsWith("{"));

    expect(topLevelRoutes).to.include.members(["shorten", "analytics"]);
    topLevelRoutes.forEach((route) =>
      expect(RESERVED_CODES.has(route.toLowerCase())).to.equal(true),
    );
  });

  it("runs lint, the format check and the unit tests on pull requests", () => {
    expect(testWorkflow.on).to.have.property("pull_request");
    expect(testWorkflow.jobs.test.steps.map((s) => s.run)).to.include.members([
      "npm run lint",
      "npm run format:check",
      "npm test",
    ]);
  });
});

describe("url table config (serverless/dynamodb-resources.yml)", () => {
  const resources = yaml.load(
    fs.readFileSync(path.join(__dirname, "../../../serverless/dynamodb-resources.yml"), "utf8"),
  );

  // Security: TTL would delete expired links and free their codes for reuse,
  // so it stays off and expired links are kept as retired records.
  it("does not enable TTL", () => {
    expect(resources.Resources.UrlTable.Properties).to.not.have.property("TimeToLiveSpecification");
  });
});
