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
  "expiresAt": "2026-12-31T23:59:59Z"
}
```

- `customCode` is optional (3–20 letters or numbers, stored in lowercase).
- `expiresAt` is optional: a future date and time. After it, the link returns `404`. Without it, the link never expires. A short code is never reused, even after its link expires.

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

Redirects to the original URL.

---

## 🚀 Deployment

### Manual Deployment via GitHub Actions

1. Go to **Actions** tab
2. Select workflow
3. Click **Run workflow**
4. Enter branch name

The workflow needs these repository secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `SERVERLESS_ACCESS_KEY` (Serverless Framework v4).

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
