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

├── .github/workflows/        # CI/CD pipeline
│   └── deploy-dev.yml
│
├── serverless.yml            # Main config
│
├── serverless/               # Modular configs
│   ├── environment.yml
│   ├── custom.yml
│   ├── functions.yml
│   ├── dynamodb-resources.yml
│
├── functions/                # Lambda functions
│   ├── create-url/
│   │   └── handler.js
│   ├── redirect/
│       └── handler.js
│
├── package.json
└── README.md
```

---

## ⚡ Features

* Serverless architecture (no servers to manage)
* Manual CI/CD pipeline using GitHub Actions
* DynamoDB-based storage
* REST API endpoints
* Modular infrastructure configuration

---

## 🛠️ Tech Stack

* Node.js
* Serverless Framework
* AWS Lambda
* API Gateway
* DynamoDB
* GitHub Actions

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

## 🚀 Deployment

### Manual Deployment via GitHub Actions

1. Go to **Actions** tab
2. Select workflow
3. Click **Run workflow**
4. Enter branch name

The workflow logs in to AWS with **OIDC**: GitHub gives each run a short-lived token, and AWS swaps it for temporary credentials of a deploy role. No AWS keys are stored in GitHub. It needs:

- the GitHub OIDC identity provider in AWS IAM, and a deploy role that trusts only this repo's `dev` environment (`repo:kantakshay/shortify-backend:environment:dev`);
- the variable `AWS_DEPLOY_ROLE_ARN` (the role's ARN) on the `dev` environment;
- the secret `SERVERLESS_ACCESS_KEY` (Serverless Framework v4 sign-in).

---

## 🧪 Testing

Unit tests run locally with DynamoDB mocked, so no AWS access is needed:

```
npm test                    # all lambdas
npm run test:create-url     # one lambda
```

End-to-end checks run against the deployed `dev` API.

---

## 🔐 Environment Variables

Defined in:

```
serverless/environment.yml
```

---

## 📈 Future Improvements

* Base62 ID generation (collision-free)
* Redis caching for faster redirects
* Analytics (click tracking)
* Custom domain support
* Rate limiting & security

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
