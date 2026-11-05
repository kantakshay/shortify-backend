# 🔗 Shortify Backend

A **serverless URL shortener backend** built for scalability, performance, and efficient link redirection.

---

## 🚀 Overview

Shortify Backend is a cloud-native URL shortening service that allows users to:

* Generate short links from long URLs
* Redirect users using short codes
* Store mappings efficiently using a NoSQL database

Built using a **serverless architecture**, this project demonstrates real-world backend and DevOps practices.

---

## 🏗️ Architecture

```
Client → API Gateway → Lambda → DynamoDB
```

* **API Gateway**: Exposes HTTP endpoints
* **Lambda**: Handles business logic
* **DynamoDB**: Stores URL mappings

---

## 📂 Project Structure

```
shortify-backend/
├── .github/
│   ├── workflows/
│   │   ├── test.yml              # PRs + pushes: lint, format, unit and integration tests
│   │   └── deploy-dev.yml        # manual deploy to dev (main/develop only) + smoke test
│   └── pull_request_template.md
│
├── serverless.yml                # entry point; pulls in the files below
├── serverless/
│   ├── environment.yml           # per-stage env vars (TABLE_NAME, STAGE, BASE_URL)
│   ├── custom.yml
│   ├── functions.yml             # the 3 Lambdas: routes, IAM, packaging
│   └── dynamodb-resources.yml    # the URL table (protected, backed up)
│
├── functions/                    # one folder per Lambda, same 3-file shape
│   ├── create-url/               # POST /shorten
│   │   ├── handler.js            #   HTTP in/out
│   │   ├── service.js            #   validation and business rules
│   │   ├── dynamoDB.js           #   database calls
│   │   └── test/                 #   unit tests (DynamoDB mocked) + config tests
│   ├── redirect-url/             # GET /{short_code}   (same files)
│   └── analytics/                # GET /analytics/{short_code}   (same files)
│
├── shared/                       # code every Lambda bundles
│   ├── dynamo.js                 # the one DynamoDB client
│   ├── response.js               # JSON / redirect / error responses with CORS
│   ├── log.js                    # WARN for user mistakes, ERROR for real failures
│   ├── expiry.js                 # isExpired()
│   └── test/
│
├── integration/                  # tests against DynamoDB Local (Docker)
│   ├── setup.js
│   └── dynamodb.integration.test.js
│
├── eslint.config.js              # lint (bugs, not style)
├── .prettierrc.json              # formatting
├── package.json
└── README.md
```

---

## ⚡ Features

* Short links with an optional custom code and an optional expiry date
* `302` redirects with click counting and a last-clicked time
* Analytics per link (clicks, created, last clicked, expiry)
* Codes are never reused, even after a link expires
* Rate limit on the whole API (10 requests per second, bursts of 20)
* One IAM role per Lambda, with only the DynamoDB actions it needs
* Protected, continuously backed-up table
* CI: lint, format check, unit tests and integration tests (DynamoDB Local) on every PR
* Manual deploy from `main`/`develop` only, with OIDC (no stored AWS keys) and a smoke test against the live API

---

## 🛠️ Tech Stack

* Node.js 24 (Lambda runtime `nodejs24.x`), AWS SDK v3
* Serverless Framework v4
* AWS Lambda
* API Gateway
* DynamoDB
* GitHub Actions
* Mocha, Chai, aws-sdk-client-mock, DynamoDB Local
* ESLint, Prettier

---

## 🔌 API Endpoints

### Create Short URL

```
POST /shorten
```

**Request Body:**

```json
{
  "url": "https://example.com",
  "customCode": "promo2026",
  "expiresAt": "2027-12-31T23:59:59+05:30"
}
```

- `customCode` is optional (3–20 letters or numbers, stored in lowercase). `shorten` and `analytics` are reserved, in any letter case, because they are API routes: they return `400`.
- `expiresAt` is optional: a future date and time. After it, the link returns `404`. Without it, the link never expires. A short code is never reused, even after its link expires.
  - It must be a full ISO 8601 date and time **with a timezone**: `Z` for UTC (`2027-12-31T18:29:59Z`) or an offset such as `+05:30` for IST (`2027-12-31T23:59:59+05:30`). Seconds and milliseconds are optional.
  - Rejected with `400`: no timezone (`2027-12-31T23:59:59`), a date only (`2027-12-31`), other formats (`Dec 31 2027`), and dates or times that don't exist (`2027-02-30T00:00:00Z`, `2027-12-31T25:00:00Z`).
  - The response's `expires_at` is always in UTC.

**Response:** `201 Created`

```json
{
  "short_code": "promo2026",
  "short_url": "https://<api-id>.execute-api.ap-south-1.amazonaws.com/dev/promo2026",
  "expires_at": "2026-12-31T23:59:59.000Z"
}
```

`expires_at` is only included when the link has an expiry.

If the custom code is already used, the response is `409` with `{ "error": "This code is taken or was used before" }`. That includes the codes of expired links: opening one gives `404`, but its code is never given out again (see [Design decisions](#-design-decisions)).

---

### Redirect

```
GET /{short_code}
```

Redirects to the original URL (`302`). Each visit adds 1 to the link's click count and records the time of the click; neither is shown to the visitor.

---

### Analytics

```
GET /analytics/{short_code}
```

Response (`200`):

```json
{
  "short_code": "promo2026",
  "long_url": "https://example.com/very/long/path",
  "clicks": 42,
  "created_at": "2026-10-28T10:00:00.000Z",
  "last_clicked_at": "2026-10-30T09:15:00.000Z"
}
```

`last_clicked_at` is `null` until the link's first click (and for links last clicked before this field was added). `expires_at` is included when the link has an expiry. Unknown and expired links return `404`.

---

### Errors

Errors are JSON: `{ "error": "<message>" }`. A `4xx` message says what to fix (e.g. `Invalid URL format`).

A `5xx` hides the real cause and adds the request ID instead:

```json
{ "error": "Internal Server Error", "requestId": "8f5c2a1e-3b7d-4c6e-9a1f-2d4e6b8c0a12" }
```

Quote the `requestId` when reporting a problem: it's the Lambda request ID, so searching for it in the function's CloudWatch log group ("Search all log streams") shows every log line of that request.

---

## 🚀 Deployment

### Manual Deployment via GitHub Actions

1. Go to **Actions** tab
2. Select the **API Pipeline** workflow
3. Click **Run workflow**
4. Pick **`develop`** (or `main`)

Only `main` and `develop` can be deployed: from any other branch the deploy job is skipped, and the GitHub Environment `dev` allows only those two branches (Settings → Environments → `dev` → Deployment branches). Feature branches are checked by the unit and integration tests on their pull request, then deployed after merging. Deploy **after** the merge, and check that the deployment summary shows the merge commit.

The workflow logs in to AWS with **OIDC**: GitHub gives each run a short-lived token, and AWS swaps it for temporary credentials of a deploy role. No AWS keys are stored in GitHub. It needs:

- the GitHub OIDC identity provider in AWS IAM, and a deploy role that trusts only this repo's `dev` environment (`repo:kantakshay/shortify-backend:environment:dev`);
- the variable `AWS_DEPLOY_ROLE_ARN` (the role's ARN) on the `dev` environment;
- the secret `SERVERLESS_ACCESS_KEY` (Serverless Framework v4 sign-in).

### Smoke test after every deploy

The last step of the deploy uses the live `dev` API like a user would, and fails the run (red) if anything is wrong:

1. `POST /shorten` creates a test link that expires in 10 minutes → expects `201`.
2. `GET /<code>`, without following the redirect → expects `302` to exactly the test URL.
3. `GET /analytics/<code>` → expects `200` and `clicks` ≥ 1 (retried a few times, because the read can lag the click by a moment).
4. The real table still has point-in-time recovery and deletion protection on.

The log says which check failed and what the API returned. The test link stays in the table after it expires (codes are never reused), so each deploy leaves one harmless retired link. A red smoke test means the broken version **is already live** on `dev`; it tells you straight away, it doesn't roll back. The deploy role needs `dynamodb:DescribeTable` and `dynamodb:DescribeContinuousBackups` on the table for step 4.

### The table is protected

The DynamoDB table holds every link, so it can't be deleted by accident:

- **`DeletionPolicy` / `UpdateReplacePolicy: Retain`**: CloudFormation keeps the table on `serverless remove`, if it disappears from the template, or if a change (a new name or key) needs a new table.
- **Deletion protection**: the table refuses to be deleted, from the console, the CLI or CloudFormation, until protection is turned off.
- **Point-in-time recovery**: continuous backups; the table can be restored to any second in the last 35 days (into a new table). It costs about $0.20 per GB per month.

Because of this, `serverless remove` deletes the Lambdas and the API but **leaves the table**, and the next deploy fails because the table already exists. To deploy again, either import the existing table into the stack (CloudFormation → the stack → Import resources), or, to really start fresh, turn off deletion protection and delete the table by hand first.

---

## 🧪 Testing

Unit tests run locally with DynamoDB mocked, so no AWS access is needed:

```
npm test                    # all lambdas
npm run test:create-url     # one lambda
```

### Integration tests (DynamoDB Local)

The unit tests mock DynamoDB, so they can't tell whether DynamoDB really enforces our condition and update expressions. The integration tests run the real code against **DynamoDB Local** (AWS's local copy of the DynamoDB engine, in Docker) and check that:

- the same code can't be saved twice, and the first link is kept;
- a click on an unknown code creates nothing;
- an expired link stays, and its code can't be taken as a custom code (`409`);
- 50 clicks at the same moment are counted as exactly 50;
- a link can be created, opened and reported end to end.

```
npm run db:start           # starts DynamoDB Local in Docker (Docker Desktop must be running)
npm run test:integration
npm run db:stop            # stops it; its data is in memory, so each start is clean
```

DynamoDB Local is reached at `http://localhost:8100` (port 8100 on your machine maps to the container's port 8000), so it doesn't clash with anything already using port 8000. To use another port, set `DYNAMODB_ENDPOINT`.

They create their own table (`url-shortener-integration`) and delete it afterwards, always use fake credentials, and refuse to run against anything but `localhost`. In CI they run in the **Integration tests** job, with DynamoDB Local as a service container. `npm test` stays the fast, mocked suite.

DynamoDB Local doesn't check IAM permissions, never throttles, has no partitions, and always returns the latest data, so those are covered elsewhere (the config tests check IAM).

End-to-end checks run against the deployed `dev` API.

---

## 🔐 Environment Variables

Defined in:

```
serverless/environment.yml
```

---

## 🧭 Design decisions

Trade-offs made on purpose. Change them only after revisiting the reason.

**A code is never reused, even after its link expires.**
- Old copies of a link (flyers, emails, QR codes, bookmarks) must never start pointing somewhere new.
- So expired links stay in the table as retired records, and the table has **no TTL** (auto-delete would free their codes). Every reader treats an expired link as not found.
- Creating a custom code that's taken *or* retired gives the same `409` message. That way the "not found" and "taken" answers don't look like a contradiction, and nobody can probe which codes existed before.

**Redirects are `302` (temporary), not `301` (permanent).**
- Browsers cache a `301` and skip us next time, so later clicks wouldn't be counted and an expired link would keep working from the cache.
- With `302`, every click reaches us. The cost is one request to us per click.

**Clicks are counted during the redirect.**
- The redirect waits for one atomic `UpdateItem` (`clicks + 1`, `last_clicked_at`), which adds a few milliseconds.
- It isn't fire-and-forget: Lambda can freeze as soon as the response is returned, so an un-awaited write could be lost.
- If the write fails, the visitor is still redirected and the failure is logged as an ERROR. A lost click is better than a broken link.
- Clicks at the same moment are all counted (DynamoDB adds them atomically). For `last_clicked_at`, the last write wins, which is fine because they're milliseconds apart.
- **Later**, with much more traffic: send click events to a queue (SQS) and count them in batches, so redirects never wait for the database.

**The same URL shortened twice gets two codes.** Each has its own clicks and expiry. Revisit when there are user accounts (then reuse per user).

**One rate limit for the whole API.** API Gateway stage throttling (10 requests per second, bursts of 20) protects the budget, and requests over it get `429`. It's shared by all callers, so one busy caller can slow everyone. Per-user limits need API keys or accounts.

**Deploys only from `main` and `develop`,** after review, to the single `dev` stage. Trying a branch before merging would need its own per-PR stage.

## 📈 Later

* Don't count link previews (WhatsApp, Slack…) as clicks
* Clicks per day, and where clicks come from (site, device, country; no IP addresses stored)
* Count clicks through a queue (SQS) instead of during the redirect
* An alarm when clicks fail to be counted
* Structured (JSON) logs
* User accounts: own links, per-user rate limits
* Scanning links for malware and phishing
* A custom domain (only `BASE_URL` changes)

---

## 🧠 Learning Outcomes

This project demonstrates:

* Serverless architecture design
* Infrastructure as Code (IaC)
* CI/CD pipeline implementation
* AWS service integration
* Debugging real-world deployment issues

---

## 📄 License

MIT License

---

## ✨ Author

Akshay Kant
