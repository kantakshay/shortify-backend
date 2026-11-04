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

  // Logs are deleted after 14 days instead of being kept (and billed) forever.
  // Set on the provider, so it applies to every Lambda's log group.
  it("keeps Lambda logs for 14 days", () => {
    expect(serverlessConfig.provider.logRetentionInDays).to.equal(14);
    Object.values(config.functions).forEach((fn) =>
      expect(fn).to.not.have.property("logRetentionInDays"),
    );
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

  // Security: only reviewed code (merged into main or develop) reaches AWS, and
  // feature branches can't overwrite what runs on dev.
  describe("who can deploy", () => {
    const allowedRefs = (condition) => [...condition.matchAll(/github\.ref == '([^']+)'/g)];

    it("is a manual deploy", () => {
      expect(workflow.on).to.have.property("workflow_dispatch");
    });

    it("deploys only from main and develop", () => {
      const condition = workflow.jobs.deploy.if;

      expect(allowedRefs(condition).map((m) => m[1])).to.have.members([
        "refs/heads/main",
        "refs/heads/develop",
      ]);
      // Only "==" checks joined with "||": nothing like != or contains() that
      // could let another branch through
      expect(condition.replace(/github\.ref == '[^']+'/g, "").trim()).to.equal("||");
    });

    // The environment's branch rule (GitHub settings) and the AWS role's trust
    // policy (environment:dev) both depend on the job running in "dev"
    it("runs in the dev environment, whose branch rule is the real lock", () => {
      expect(workflow.jobs.deploy.environment).to.equal("dev");
    });
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

  // Security (OIDC): the deploy job may request a GitHub OIDC token and read
  // the code, nothing else.
  it("lets only the deploy job request an OIDC token, with read-only code access", () => {
    expect(workflow.jobs.deploy.permissions).to.deep.equal({
      "id-token": "write",
      contents: "read",
    });
    expect(workflow).to.not.have.property("permissions");
  });

  // Security (OIDC): AWS is reached through a role with temporary credentials,
  // never through long-lived access keys stored in GitHub.
  it("logs in to AWS by assuming the deploy role, before deploying", () => {
    const steps = workflow.jobs.deploy.steps;
    const loginIndex = steps.findIndex((s) =>
      (s.uses || "").startsWith("aws-actions/configure-aws-credentials@"),
    );
    const deployIndex = steps.findIndex((s) => s.name === "Deploy to AWS (dev)");

    expect(loginIndex).to.be.at.least(0);
    expect(loginIndex).to.be.below(deployIndex);
    expect(steps[loginIndex].with).to.deep.equal({
      "role-to-assume": "${{ vars.AWS_DEPLOY_ROLE_ARN }}",
      "role-session-name": "github-deploy-${{ github.run_id }}",
      "aws-region": "ap-south-1",
    });
  });

  it("uses no stored AWS access keys anywhere in the deploy workflow", () => {
    const text = fs.readFileSync(
      path.join(__dirname, "../../../.github/workflows/deploy-dev.yml"),
      "utf8",
    );

    ["aws-access-key-id", "aws-secret-access-key", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]
      .filter((name) => text.includes(name))
      .forEach((name) => expect.fail(`deploy workflow still mentions ${name}`));
  });

  // Least privilege: the test workflow's GITHUB_TOKEN can only read the code.
  it("gives the test workflow a read-only GITHUB_TOKEN", () => {
    expect(testWorkflow.permissions).to.deep.equal({ contents: "read" });
    Object.values(testWorkflow.jobs).forEach((job) =>
      expect(job).to.not.have.property("permissions"),
    );
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
      "- [ ] `npm run test:integration` passes locally (if DynamoDB code changed)",
      "## After merging",
      "- [ ] Redeployed `develop` to dev (the deployment summary shows the merge commit)",
      "- [ ] Tested on dev in Postman",
      "## Risks / follow-ups",
    ].forEach((line) => expect(template).to.include(line));

    // Feature branches can't be deployed any more, so the template must not ask for it
    expect(template).to.not.include("Deployed this branch");
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

  // pull_request_target runs the base branch's copy of test.yml, so a PR can't
  // remove or weaken the checks for its own run.
  describe("CI runs from the base branch", () => {
    const text = fs.readFileSync(
      path.join(__dirname, "../../../.github/workflows/test.yml"),
      "utf8",
    );
    const checkouts = Object.values(testWorkflow.jobs).map((job) =>
      job.steps.find((s) => s.uses && s.uses.startsWith("actions/checkout@")),
    );

    it("uses pull_request_target, not pull_request, for pull requests", () => {
      expect(testWorkflow.on).to.have.property("pull_request_target");
      expect(testWorkflow.on).to.not.have.property("pull_request");
      expect(testWorkflow.on.push.branches).to.deep.equal(["main", "develop"]);
    });

    // Without the ref, pull_request_target would test the base branch, not the PR
    it("checks out the PR's head commit (or the pushed commit) in every job", () => {
      expect(checkouts).to.have.length(Object.keys(testWorkflow.jobs).length);
      checkouts.forEach((step) =>
        expect(step.with.ref).to.equal("${{ github.event.pull_request.head.sha || github.sha }}"),
      );
    });

    it("doesn't leave the token in .git where PR code could read it", () => {
      checkouts.forEach((step) => expect(step.with["persist-credentials"]).to.equal(false));
    });

    // PR code runs with the base repo's context, so nothing worth stealing may be in reach
    it("uses no secrets and no caches", () => {
      expect(text).to.not.match(/secrets\./);
      expect(text).to.not.include("actions/cache");
      Object.values(testWorkflow.jobs)
        .flatMap((job) => job.steps)
        .filter((s) => s.uses && s.uses.startsWith("actions/setup-node@"))
        .forEach((s) => expect(s.with).to.not.have.property("cache"));
    });
  });

  it("runs lint, the format check and the unit tests on pull requests", () => {
    expect(testWorkflow.jobs.test.steps.map((s) => s.run)).to.include.members([
      "npm run lint",
      "npm run format:check",
      "npm test",
    ]);
  });

  // The data-safety rules (no overwrites, no junk items, no lost clicks) live in
  // DynamoDB expressions, which only a real DynamoDB engine can check.
  describe("integration tests", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../../package.json"), "utf8"),
    );
    const job = testWorkflow.jobs.integration;

    it("runs against a pinned DynamoDB Local service container on every pull request", () => {
      expect(job.services.dynamodb.image).to.match(/^amazon\/dynamodb-local:\d+\.\d+\.\d+$/);
      expect(job.services.dynamodb.ports).to.deep.equal(["8100:8000"]);
    });

    it("installs with npm ci and runs npm run test:integration against localhost:8100", () => {
      const runs = job.steps.map((s) => s.run);
      const step = job.steps.find((s) => s.run === "npm run test:integration");

      expect(runs).to.include("npm ci");
      expect(step.env).to.deep.equal({ DYNAMODB_ENDPOINT: "http://localhost:8100" });
    });

    // Local runs and CI must test against the same DynamoDB Local version
    it("starts the same DynamoDB Local image and port locally (npm run db:start) as in CI", () => {
      expect(packageJson.scripts["db:start"]).to.include(job.services.dynamodb.image);
      expect(packageJson.scripts["db:start"]).to.include(`-p ${job.services.dynamodb.ports[0]}`);
    });

    it("keeps npm test as the fast mocked suite, without the integration tests", () => {
      expect(packageJson.scripts.test).to.not.include("integration");
      expect(packageJson.scripts["test:integration"]).to.include("--require integration/setup.js");
    });
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

  // Data safety: the table holds every link, so no deploy, remove or click in the
  // console may delete it, and bad writes can be rolled back.
  describe("protection from deletion and data loss", () => {
    const table = resources.Resources.UrlTable;

    it("keeps the table when it leaves the stack (serverless remove, removed from template)", () => {
      expect(table.DeletionPolicy).to.equal("Retain");
    });

    it("keeps the old table when a change needs a replacement table", () => {
      expect(table.UpdateReplacePolicy).to.equal("Retain");
    });

    it("turns on DynamoDB deletion protection", () => {
      expect(table.Properties.DeletionProtectionEnabled).to.equal(true);
    });

    it("turns on point-in-time recovery (continuous backups)", () => {
      expect(table.Properties.PointInTimeRecoverySpecification).to.deep.equal({
        PointInTimeRecoveryEnabled: true,
      });
    });

    it("is still included in serverless.yml, so a refactor can't drop the table", () => {
      expect(serverlessConfig.resources).to.include("${file(./serverless/dynamodb-resources.yml)}");
    });
  });
});
