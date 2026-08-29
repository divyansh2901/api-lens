# 🔭 API Observatory

> An AI-powered API observability platform for Express.js applications.

API Observatory is an intermediate-level, portfolio-grade API observability platform that allows developers to monitor their Express/Node.js APIs through a custom SDK.

The platform automatically collects non-sensitive API request metrics, processes them asynchronously using RabbitMQ, stores them in PostgreSQL, exposes analytics through REST APIs, and presents the results through a React dashboard.

An AI layer analyzes structured API analytics and generates human-readable explanations, recommendations, and eventually conversational answers about API performance.

---

# Table of Contents

1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Goals](#3-goals)
4. [Non-Goals](#4-non-goals)
5. [Target User](#5-target-user)
6. [Core User Journey](#6-core-user-journey)
7. [System Architecture](#7-system-architecture)
8. [Detailed Data Flow](#8-detailed-data-flow)
9. [Technology Stack](#9-technology-stack)
10. [Repository Structure](#10-repository-structure)
11. [Backend Architecture](#11-backend-architecture)
12. [Frontend Architecture](#12-frontend-architecture)
13. [SDK Architecture](#13-sdk-architecture)
14. [Database Design](#14-database-design)
15. [Authentication](#15-authentication)
16. [API Key Management](#16-api-key-management)
17. [SDK Requirements](#17-sdk-requirements)
18. [Ingestion API](#18-ingestion-api)
19. [RabbitMQ Architecture](#19-rabbitmq-architecture)
20. [Worker Architecture](#20-worker-architecture)
21. [Analytics System](#21-analytics-system)
22. [AI System](#22-ai-system)
23. [Dashboard](#23-dashboard)
24. [Validation](#24-validation)
25. [Error Handling](#25-error-handling)
26. [Logging](#26-logging)
27. [Security Requirements](#27-security-requirements)
28. [Environment Variables](#28-environment-variables)
29. [Development Phases](#29-development-phases)
30. [Testing Strategy](#30-testing-strategy)
31. [Docker Strategy](#31-docker-strategy)
32. [Git Workflow](#32-git-workflow)
33. [Coding Rules](#33-coding-rules)
34. [AI Coding Agent Instructions](#34-ai-coding-agent-instructions)
35. [Things We Are Explicitly NOT Using](#35-things-we-are-explicitly-not-using)
36. [Definition of Done](#36-definition-of-done)
37. [Future Improvements](#37-future-improvements)
38. [Resume Description](#38-resume-description)

---

# 1. Project Overview

API Observatory is an observability platform designed specifically for Express.js APIs.

A developer should be able to install a custom npm package and add one middleware to their Express application.

Example:

```ts
import express from "express";
import { observatory } from "api-observatory-sdk";

const app = express();

app.use(
  observatory({
    apiKey: process.env.OBSERVATORY_API_KEY!,
  })
);
```

After this, API Observatory should automatically collect useful request-level metadata.

Example event:

```json
{
  "method": "GET",
  "route": "/products",
  "status": 200,
  "latency": 143,
  "timestamp": "2026-08-27T12:30:00.000Z"
}
```

The SDK sends this telemetry to the API Observatory backend.

The backend authenticates and validates the event, places it into RabbitMQ, and immediately responds to the SDK.

A background worker consumes the event and stores it in PostgreSQL.

The analytics API then aggregates the stored data.

The React dashboard displays the analytics.

The AI layer analyzes structured analytics and generates useful explanations and recommendations.

---

# 2. Problem Statement

Developers often don't have an easy way to understand what is happening inside their APIs.

Questions that API Observatory should help answer include:

* Which endpoint is slow?
* Which endpoint has the highest error rate?
* How many requests are coming in?
* When did latency increase?
* Which endpoint receives the most traffic?
* Which endpoints are failing?
* What status codes are occurring?
* Which endpoints are responsible for most errors?
* What should the developer investigate first?

Raw server logs can contain some of this information, but they are difficult to analyze manually.

API Observatory converts raw request activity into structured observability data.

The AI layer adds another level by explaining the analytics in natural language.

---

# 3. Goals

The primary goals are:

* Build a real Express observability platform.
* Build a custom Express middleware SDK.
* Automatically capture API request metadata.
* Authenticate SDK requests using project API keys.
* Process telemetry asynchronously.
* Use RabbitMQ as the message broker.
* Store telemetry in PostgreSQL.
* Use Prisma as the ORM.
* Provide REST APIs for analytics.
* Build a React analytics dashboard.
* Generate meaningful AI insights.
* Maintain strong backend architecture.
* Demonstrate authentication and authorization.
* Demonstrate validation and security.
* Demonstrate asynchronous processing.
* Demonstrate database design and indexing.
* Demonstrate Docker-based development/deployment.
* Produce a project suitable for a resume and technical interviews.

---

# 4. Non-Goals

This is NOT intended to be:

* A beginner CRUD application.
* A Google-scale observability platform.
* A replacement for Datadog.
* A replacement for New Relic.
* A replacement for Grafana.
* A huge distributed system.
* A multi-language SDK platform in V1.
* A Kubernetes project.
* A Kafka project.
* A microservices showcase.

Do not add technologies simply to make the resume look impressive.

Every technology must solve an actual problem.

---

# 5. Target User

V1 targets:

> Developers building Express.js / Node.js APIs.

We are intentionally focusing on Express first.

Do not build SDKs for Python, Java, Go, Django, FastAPI, Spring, etc. during V1.

Future versions may support additional frameworks.

---

# 6. Core User Journey

The primary user journey is:

```text
Signup
   ↓
Login
   ↓
Create Project
   ↓
Generate API Key
   ↓
Install SDK
   ↓
Add SDK middleware
   ↓
Developer API receives requests
   ↓
SDK captures metrics
   ↓
SDK sends metrics to API Observatory
   ↓
Ingestion API authenticates API key
   ↓
Validate telemetry
   ↓
Publish to RabbitMQ
   ↓
Return response
   ↓
Worker consumes message
   ↓
Store RequestLog in PostgreSQL
   ↓
Analytics API queries PostgreSQL
   ↓
React Dashboard displays analytics
   ↓
AI analyzes structured analytics
   ↓
AI insight displayed on dashboard
```

---

# 7. System Architecture

High-level architecture:

```text
┌───────────────────────────────┐
│ Developer's Express API       │
│                               │
│   Application Routes          │
│          │                    │
│          ▼                    │
│   API Observatory SDK         │
└───────────────┬───────────────┘
                │
                │ HTTPS
                ▼
┌───────────────────────────────┐
│ API Observatory Backend       │
│                               │
│       Ingestion API           │
└───────────────┬───────────────┘
                │
                │ publish
                ▼
        ┌───────────────┐
        │   RabbitMQ    │
        └───────┬───────┘
                │
                │ consume
                ▼
        ┌───────────────┐
        │    Worker     │
        └───────┬───────┘
                │
                ▼
        ┌───────────────┐
        │  PostgreSQL   │
        └───────┬───────┘
                │
                ▼
        ┌───────────────┐
        │ Analytics API │
        └───────┬───────┘
                │
                ▼
        ┌───────────────┐
        │ React Dashboard│
        └───────────────┘
```

AI is an additional layer:

```text
PostgreSQL
    ↓
Analytics Service
    ↓
Structured Analytics Summary
    ↓
AI Service
    ↓
Gemini / LLM
    ↓
AI Insight
    ↓
Dashboard
```

---

# 8. Detailed Data Flow

## 8.1 Developer Request

A user calls:

```http
GET /products
```

inside the developer's Express application.

The Observatory SDK middleware observes the request.

It records:

```json
{
  "method": "GET",
  "route": "/products",
  "status": 200,
  "latency": 143,
  "timestamp": "..."
}
```

The SDK must not collect sensitive application data.

---

## 8.2 SDK → Ingestion API

The SDK sends telemetry to:

```http
POST /ingest
```

Authentication is performed using the project's API key.

Example conceptual request:

```http
POST /ingest
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

The body contains telemetry.

---

## 8.3 Ingestion API

The ingestion API must:

1. Receive telemetry.
2. Authenticate the API key.
3. Determine the associated project.
4. Validate the telemetry.
5. Publish the event to RabbitMQ.
6. Return an appropriate response.

The ingestion API should NOT perform expensive analytics operations.

It should not directly perform heavy database aggregation.

Its primary purpose is reliable ingestion.

---

## 8.4 RabbitMQ

RabbitMQ acts as the buffer between ingestion and persistence.

```text
SDK
 ↓
Ingestion API
 ↓
RabbitMQ
 ↓
Worker
 ↓
PostgreSQL
```

This means the SDK does not need to wait for PostgreSQL operations.

---

## 8.5 Worker

The worker:

1. Consumes messages.
2. Parses/validates them.
3. Converts them into database records.
4. Stores them in PostgreSQL.
5. Acknowledges successfully processed messages.
6. Handles failures appropriately.

---

## 8.6 Analytics

The analytics service reads stored request logs.

Examples:

```text
Total Requests
Average Latency
Error Rate
Success Rate
Requests Over Time
Status Code Distribution
Top Endpoints
Slowest Endpoints
Endpoint Request Counts
Endpoint Average Latency
Endpoint Error Rate
Recent Requests
```

---

# 9. Technology Stack

## Backend

* TypeScript
* Node.js
* Express
* Prisma
* PostgreSQL
* RabbitMQ

## Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* Recharts
* Axios or fetch

## SDK

* TypeScript
* Node.js
* Express middleware
* npm package

## Security

* JWT
* bcrypt
* API keys
* Zod
* Helmet
* CORS
* Rate limiting where appropriate

## Logging

* Pino

## DevOps

* Docker
* Docker Compose

## AI

* Gemini API initially

---

# 10. Repository Structure

Target repository:

```text
api-observatory/
│
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   │
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── app.ts
│   │   └── server.ts
│   │
│   ├── .env
│   ├── .gitignore
│   ├── package.json
│   ├── prisma.config.ts
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── ...
│   ├── package.json
│   └── ...
│
├── sdk/
│   ├── src/
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
│
├── docker-compose.yml
├── README.md
└── .gitignore
```

Do not create unnecessary empty files.

Create files when the corresponding feature is implemented.

---

# 11. Backend Architecture

The backend should use layered architecture.

General request flow:

```text
Route
  ↓
Middleware
  ↓
Controller
  ↓
Service
  ↓
Prisma
  ↓
PostgreSQL
```

## Routes

Routes define HTTP endpoints.

Example:

```text
POST /api/auth/signup
POST /api/auth/login
GET  /api/projects
POST /api/projects
POST /api/projects/:id/keys
POST /ingest
GET  /api/analytics/:projectId
```

Routes should remain thin.

Do not put business logic directly into route definitions.

---

## Controllers

Controllers handle HTTP concerns:

* Request
* Response
* Parameters
* Status codes
* Calling services

Controllers should not contain large business-logic blocks.

---

## Services

Services contain business logic.

Example:

```text
AuthService
ProjectService
ApiKeyService
AnalyticsService
AiService
```

Services interact with Prisma or other infrastructure when required.

---

## Middleware

Middleware may handle:

* JWT authentication
* API key authentication
* Request validation
* Rate limiting
* Error handling
* Security middleware

---

## Config

Configuration should be centralized.

Examples:

```text
PORT
DATABASE_URL
JWT_SECRET
RABBITMQ_URL
GEMINI_API_KEY
INGESTION_URL
```

Never hard-code secrets.

---

# 12. Frontend Architecture

The frontend is responsible for presentation.

Backend:

```text
returns structured JSON
```

Frontend:

```text
JSON
 ↓
React state
 ↓
Charts
 ↓
Tables
 ↓
Cards
```

The backend must not generate charts.

The frontend will use Recharts for visualization.

Potential dashboard sections:

```text
Project Overview

┌──────────────────────────────────────────┐
│ Total Requests │ Avg Latency │ Error %  │
└──────────────────────────────────────────┘

Traffic Chart

Latency Chart

Status Code Distribution

Top Endpoints

Slowest Endpoints

Recent Requests

AI Insights

Ask Observatory
```

---

# 13. SDK Architecture

The SDK is a major feature.

Desired usage:

```ts
import express from "express";
import { observatory } from "api-observatory-sdk";

const app = express();

app.use(
  observatory({
    apiKey: process.env.OBSERVATORY_API_KEY!,
  })
);
```

The SDK should:

1. Act as Express middleware.
2. Capture request metadata.
3. Measure latency.
4. Determine status code.
5. Determine route.
6. Generate timestamp.
7. Send telemetry asynchronously.
8. Avoid collecting sensitive information.
9. Avoid significantly slowing the developer's API.

---

# 14. Database Design

V1 database entities:

```text
User
Project
ApiKey
RequestLog
```

`AiInsight` may be introduced later when persistent AI insight history is actually required.

---

## 14.1 User

Represents a dashboard user.

Fields:

```text
id
email
passwordHash
createdAt
updatedAt
```

Relationship:

```text
User 1 ───── N Project
```

One user can own multiple projects.

---

## 14.2 Project

Represents an API being monitored.

Fields:

```text
id
name
userId
createdAt
updatedAt
```

Relationships:

```text
Project N ───── 1 User

Project 1 ───── N ApiKey

Project 1 ───── N RequestLog
```

---

## 14.3 ApiKey

Represents a credential used by the SDK.

Fields:

```text
id
keyHash
projectId
createdAt
revokedAt
```

Important:

Do NOT store raw API keys in the database.

Store a secure hash.

Flow:

```text
Generate raw key
      ↓
Show raw key to developer
      ↓
Hash key
      ↓
Store hash
```

When telemetry arrives:

```text
Incoming API key
      ↓
Hash
      ↓
Compare with stored hash
      ↓
Valid → continue
Invalid → reject
```

---

## 14.4 RequestLog

Represents one API request event.

Fields:

```text
id
projectId
method
route
statusCode
latency
timestamp
```

Example:

```json
{
  "method": "GET",
  "route": "/orders",
  "statusCode": 500,
  "latency": 842,
  "timestamp": "2026-08-27T12:30:00Z"
}
```

---

# 15. Authentication

There are two separate authentication systems.

## 15.1 Dashboard Authentication

Used by humans.

Flow:

```text
Signup
 ↓
Password hash
 ↓
Store User
```

Login:

```text
Email + Password
 ↓
Find User
 ↓
Verify password
 ↓
Generate JWT
 ↓
Return JWT
```

Protected dashboard requests:

```text
JWT
 ↓
Authentication Middleware
 ↓
Identify User
 ↓
Controller
```

---

## 15.2 SDK Authentication

Used by applications.

```text
SDK
 ↓
API Key
 ↓
Ingestion API
 ↓
API-key authentication
 ↓
Project identified
```

Do not use JWT for SDK telemetry ingestion.

---

# 16. API Key Management

API keys must be:

* Unique.
* Cryptographically unpredictable.
* Stored as hashes.
* Revocable.
* Associated with exactly one project.
* Never returned in plaintext after initial creation.

Possible endpoints:

```http
POST /api/projects/:projectId/keys
GET /api/projects/:projectId/keys
DELETE /api/projects/:projectId/keys/:keyId
```

When a key is created, the raw key should be shown once.

---

# 17. SDK Requirements

The SDK should capture:

```text
HTTP method
Route
Status code
Latency
Timestamp
```

The SDK must NOT automatically collect:

```text
Passwords
Cookies
Authorization headers
Request bodies
Response bodies
Payment information
```

The SDK is focused on observability metadata.

The SDK should avoid blocking the user's API request while telemetry is sent.

Telemetry delivery should be best-effort and asynchronous.

SDK failures should not crash the developer's application.

---

# 18. Ingestion API

Primary endpoint:

```http
POST /ingest
```

Responsibilities:

```text
Receive
 ↓
Authenticate API key
 ↓
Validate
 ↓
Publish RabbitMQ message
 ↓
Respond
```

The endpoint should return quickly.

Possible successful response:

```json
{
  "success": true
}
```

Invalid authentication:

```http
401 Unauthorized
```

Invalid payload:

```http
400 Bad Request
```

Rate limited:

```http
429 Too Many Requests
```

Internal failure:

```http
500 Internal Server Error
```

---

# 19. RabbitMQ Architecture

RabbitMQ provides asynchronous processing.

Architecture:

```text
Producer
   │
   ▼
RabbitMQ Exchange / Queue
   │
   ▼
Consumer Worker
```

Initially keep RabbitMQ architecture simple.

Do not create a complicated multi-exchange topology without a real requirement.

The queue should contain serialized telemetry events.

Example message:

```json
{
  "projectId": "uuid",
  "method": "GET",
  "route": "/products",
  "statusCode": 200,
  "latency": 143,
  "timestamp": "2026-08-27T12:30:00Z"
}
```

---

# 20. Worker Architecture

The worker is responsible for persistence.

Flow:

```text
RabbitMQ
 ↓
Worker
 ↓
Deserialize message
 ↓
Validate/prepare
 ↓
Prisma
 ↓
PostgreSQL
 ↓
ACK
```

Important concepts to understand and implement:

* Message acknowledgement.
* Failure handling.
* Retry strategy.
* What happens if PostgreSQL is unavailable.
* What happens if a message cannot be processed.

Do not silently acknowledge a message before it has been successfully processed.

---

# 21. Analytics System

Analytics should be calculated from `RequestLog`.

Core metrics:

## Total Requests

Count request logs.

```text
COUNT(*)
```

---

## Average Latency

```text
AVG(latency)
```

---

## Error Rate

Define errors consistently.

Initial approach:

```text
statusCode >= 400
```

Error rate:

```text
error requests / total requests * 100
```

---

## Success Rate

```text
successful requests / total requests * 100
```

---

## Requests Over Time

Group requests by time bucket.

For example:

```text
12:00 → 120 requests
12:05 → 145 requests
12:10 → 190 requests
```

---

## Status Code Distribution

Example:

```text
200 → 9234
201 → 1320
400 → 412
401 → 120
404 → 230
500 → 84
```

---

## Top Endpoints

Sort endpoints by request count.

Example:

```text
/products → 5234
/users    → 3102
/orders   → 1840
```

---

## Slowest Endpoints

Group by route and calculate average latency.

Example:

```text
/orders      → 742ms
/reports     → 620ms
/products    → 143ms
```

---

## Endpoint Error Rate

For each route:

```text
route error count / route total * 100
```

---

## Recent Requests

Return recent request logs ordered by timestamp descending.

---

# 22. AI System

AI must be a meaningful feature.

Do NOT send arbitrary raw database data to the LLM.

First calculate structured analytics.

Example:

```json
{
  "totalRequests": 12482,
  "averageLatency": 143,
  "errorRate": 1.7,
  "slowestEndpoints": [
    {
      "route": "/orders",
      "averageLatency": 742
    }
  ],
  "topEndpoints": [
    {
      "route": "/products",
      "requests": 5234
    }
  ]
}
```

Then:

```text
Structured Analytics
        ↓
AI Service
        ↓
Gemini
        ↓
Explanation
        ↓
Dashboard
```

---

## AI Requirements

AI should:

* Explain unusual metrics.
* Identify potentially problematic endpoints.
* Compare endpoint performance against application averages.
* Suggest reasonable investigation areas.
* Avoid pretending to know information that telemetry does not contain.
* Clearly distinguish observations from possible causes.
* Avoid inventing database queries, infrastructure problems, or code behavior.

Example:

```text
The /orders endpoint is currently the slowest endpoint,
with an average latency significantly above the application
average.

Possible areas to investigate include database queries,
missing indexes, external API calls, or expensive response
processing.

Recommended next step:
inspect the database operations associated with /orders.
```

The AI should NOT simply repeat:

```text
Average latency: 143ms
```

because the dashboard already shows that.

---

# 23. Dashboard

Dashboard requirements:

## Overview

Display:

```text
Total Requests
Average Latency
Error Rate
Success Rate
```

## Traffic

Chart requests over time.

## Latency

Chart latency over time.

## Status Codes

Visualize status code distribution.

## Endpoints

Show:

```text
Most Used
Slowest
Highest Error Rate
```

## Recent Requests

Table:

```text
Method | Route | Status | Latency | Timestamp
```

## AI Insights

Show generated explanations.

## Ask Observatory

Future conversational interface.

Example:

```text
User:
Why is /orders slow?

AI:
/orders currently has an average latency of 742ms,
which is approximately 5x the application average...
```

The AI must ground responses in actual project analytics.

---

# 24. Validation

Use Zod for request validation.

Every externally supplied payload must be validated.

Examples:

```text
Signup request
Login request
Create project request
Telemetry payload
Analytics query parameters
```

Do not trust client input.

Example telemetry validation concept:

```text
method → string
route → string
statusCode → valid integer
latency → non-negative integer
timestamp → valid date
```

---

# 25. Error Handling

Use centralized Express error handling.

Controllers should not repeatedly implement identical error-response logic.

Errors should have predictable structures.

Example:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload"
  }
}
```

Do not expose:

* Database passwords.
* JWT secrets.
* API key hashes.
* Internal stack traces.
* Sensitive infrastructure information.

Stack traces may be logged internally during development.

---

# 26. Logging

Use structured logging.

Pino is preferred.

Logs should help answer:

```text
What happened?
When?
Where?
Why?
```

Examples:

```text
Server started
Database connected
User registered
Login successful
Invalid JWT
Project created
API key generated
Telemetry received
Telemetry rejected
RabbitMQ publish failed
Worker processed event
Database insert failed
```

Never log:

```text
Passwords
Raw API keys
JWT secrets
Authorization headers
Request bodies containing sensitive information
```

---

# 27. Security Requirements

Security is a core part of the project.

## Passwords

Never store plaintext passwords.

Use bcrypt.

```text
Password
 ↓
bcrypt
 ↓
passwordHash
 ↓
Database
```

---

## JWT

JWT secret must be stored in environment variables.

Never hard-code it.

JWT should contain only the minimum required claims.

---

## API Keys

Store hashes, not plaintext keys.

Support revocation.

---

## Environment Secrets

Never commit:

```text
.env
```

to Git.

---

## Helmet

Use Helmet for basic HTTP security headers.

---

## CORS

Configure CORS intentionally.

Do not blindly use:

```ts
cors()
```

in production without considering allowed origins.

---

## Rate Limiting

Rate limiting should especially be considered for:

```text
Login
Signup
API key endpoints
Telemetry ingestion
AI endpoints
```

Do not introduce Redis merely to implement rate limiting in V1.

Use a simple approach initially.

---

# 28. Environment Variables

Backend environment:

```env
PORT=5000

DATABASE_URL="..."

JWT_SECRET="..."

RABBITMQ_URL="..."

GEMINI_API_KEY="..."

INGESTION_URL="..."
```

Frontend should NEVER receive:

```text
DATABASE_URL
JWT_SECRET
RABBITMQ_URL
GEMINI_API_KEY
```

The Gemini API key must remain backend-only.

---

# 29. Development Phases

Do not randomly jump between components.

Follow this sequence.

---

## Phase 1 — Project Setup

Complete:

* Repository structure.
* TypeScript.
* Express.
* Basic health endpoint.
* Environment configuration.
* Basic logging setup.

Health endpoint:

```http
GET /health
```

Response:

```json
{
  "status": "ok"
}
```

---

## Phase 2 — Authentication

Build:

```text
Signup
Login
JWT
Password hashing
Protected routes
Authentication middleware
```

Test authentication before moving on.

---

## Phase 3 — Projects and API Keys

Build:

```text
Create project
List projects
Get project
Delete project
Generate API key
List/revoke API keys
```

Enforce ownership.

A user must never access another user's project.

---

## Phase 4 — SDK

Build:

```text
Express middleware
Request measurement
Telemetry creation
API key handling
HTTP delivery
Error isolation
```

Test against a sample Express application.

---

## Phase 5 — Ingestion API

Build:

```text
POST /ingest
API key authentication
Payload validation
RabbitMQ publishing
```

---

## Phase 6 — RabbitMQ + Worker

Build:

```text
Producer
Queue
Consumer
Database persistence
ACK
Failure handling
```

---

## Phase 7 — Analytics API

Build endpoints for:

```text
Overview
Traffic
Latency
Status distribution
Top endpoints
Slow endpoints
Endpoint errors
Recent requests
```

---

## Phase 8 — React Dashboard

Build:

```text
Login
Projects
Project selection
Overview cards
Charts
Endpoint tables
Recent requests
```

---

## Phase 9 — AI Integration

Build:

```text
Analytics summary
AI service
Gemini integration
AI insight endpoint
Dashboard AI section
```

Then consider:

```text
Ask Observatory
```

---

## Phase 10 — Hardening

Add:

```text
Validation
Logging
Error handling
Testing
Security
Rate limiting
Input sanitization
```

---

## Phase 11 — Docker + Deployment

Containerize:

```text
Backend
Worker
Frontend
RabbitMQ
```

Use Docker Compose for local infrastructure where appropriate.

PostgreSQL may remain hosted through Neon during development/deployment if appropriate.

---

# 30. Testing Strategy

Testing should be introduced incrementally.

At minimum:

## Unit Tests

Test business logic such as:

```text
Password validation
API key generation
API key hashing
Analytics calculations
```

## Integration Tests

Test:

```text
Signup → PostgreSQL
Login → JWT
Project creation → PostgreSQL
API key generation
```

## API Tests

Test:

```text
Authentication
Authorization
Validation
Error responses
Ingestion
Analytics
```

## SDK Tests

Test:

```text
Middleware captures request
Latency measured
Correct status captured
Telemetry generated
SDK handles ingestion failure without crashing host application
```

## Worker Tests

Test:

```text
Message consumed
Database insertion
Successful ACK
Failure handling
```

---

# 31. Docker Strategy

Docker should be introduced after the core functionality works.

Do not start with complicated container orchestration.

Initial Docker Compose may include:

```text
backend
worker
rabbitmq
frontend
```

PostgreSQL can remain Neon during development if desired.

Later, local PostgreSQL can be added to Docker Compose if useful.

---

# 32. Git Workflow

Use meaningful commits.

Bad:

```text
update
changes
final
test
asdf
```

Good:

```text
feat: add user signup
feat: add JWT authentication
feat: add project creation
feat: add API key generation
feat: add telemetry ingestion
feat: add RabbitMQ worker
feat: add analytics endpoints
feat: add dashboard overview
feat: add AI insights
fix: handle invalid API keys
test: add authentication tests
```

Keep commits focused.

Do not mix unrelated features into one commit.

---

# 33. Coding Rules

These rules apply throughout the project.

## Rule 1 — Do not over-engineer

Prefer simple solutions.

Do not introduce:

```text
Kubernetes
Kafka
Redis
Elasticsearch
ClickHouse
Microservices
```

unless a real requirement appears.

---

## Rule 2 — Keep layers separate

Do not put:

```text
Database queries
Business logic
Validation
HTTP handling
```

all in one controller.

---

## Rule 3 — Keep controllers thin

Prefer:

```text
Controller
 ↓
Service
 ↓
Prisma
```

rather than:

```text
Controller
 ↓
100 lines of business logic
 ↓
Database
```

---

## Rule 4 — Validate external input

Use Zod.

---

## Rule 5 — Never expose secrets

Never send backend secrets to frontend.

---

## Rule 6 — Don't blindly copy code

Every major implementation should be understandable.

---

## Rule 7 — Don't create unnecessary abstractions

Do not create an interface, factory, repository, helper, service, or class unless there is a real reason.

---

## Rule 8 — Use TypeScript properly

Avoid:

```ts
any
```

unless there is a strong reason.

Prefer explicit types.

---

## Rule 9 — Handle errors deliberately

Don't use:

```ts
catch {
  // ignore
}
```

without a reason.

---

## Rule 10 — Keep API contracts consistent

Responses should have predictable structures.

---

# 34. AI Coding Agent Instructions

The IDE coding agent must follow these rules.

## IMPORTANT

This README is the project's source of truth.

Before implementing a feature:

1. Inspect the existing code.
2. Understand the current architecture.
3. Do not rewrite working code unnecessarily.
4. Do not introduce technologies not specified here.
5. Follow the development phases.
6. Implement incrementally.
7. Keep changes focused.
8. Preserve existing functionality.
9. Run tests/type checking after meaningful changes.
10. Report what changed.

---

## Before writing major code

The agent should briefly state:

```text
What are we building?
Why do we need it?
How will it work?
Which files will change?
```

Then implement.

Do not dump huge amounts of code without context.

---

## When an error occurs

Do NOT blindly rewrite the project.

Instead:

1. Read the error.
2. Identify the root cause.
3. Inspect relevant files.
4. Make the smallest reasonable fix.
5. Run the failing command again.
6. Verify the result.

---

## Do not change architecture without reason

Do not suddenly introduce:

```text
Redis
Kafka
Kubernetes
Microservices
GraphQL
Elasticsearch
ClickHouse
```

just because they are commonly used in large systems.

---

## Do not replace PostgreSQL

PostgreSQL is the chosen database.

Use Prisma with PostgreSQL.

---

## Do not replace RabbitMQ

RabbitMQ is the chosen asynchronous messaging system.

Do not replace it with Kafka unless the project requirements fundamentally change.

---

## Do not build all features simultaneously

Follow:

```text
Foundation
 ↓
Authentication
 ↓
Projects
 ↓
API Keys
 ↓
SDK
 ↓
Ingestion
 ↓
RabbitMQ
 ↓
Worker
 ↓
Analytics
 ↓
Dashboard
 ↓
AI
 ↓
Hardening
 ↓
Docker/Deployment
```

---

# 35. Things We Are Explicitly NOT Using

Unless a real requirement appears, do NOT introduce:

```text
Kubernetes
Kafka
Redis
Elasticsearch
ClickHouse
GraphQL
Microservices
Complex cloud architecture
Event sourcing
CQRS
Service mesh
```

The project should demonstrate engineering judgment by **not** adding unnecessary infrastructure.

---

# 36. Definition of Done

API Observatory is considered complete when a developer can:

```text
1. Create an account
        ↓
2. Login
        ↓
3. Create a project
        ↓
4. Generate an API key
        ↓
5. Install SDK
        ↓
6. Add SDK middleware
        ↓
7. Run their Express API
        ↓
8. Generate API traffic
        ↓
9. SDK sends telemetry
        ↓
10. Backend authenticates telemetry
        ↓
11. RabbitMQ receives event
        ↓
12. Worker processes event
        ↓
13. PostgreSQL stores event
        ↓
14. Analytics API calculates metrics
        ↓
15. Dashboard displays metrics
        ↓
16. AI analyzes metrics
        ↓
17. Dashboard displays AI insight
```

The complete system should work end-to-end.

---

# 37. Future Improvements

Potential future features:

## SDK improvements

* Automatic batching.
* Retry with exponential backoff.
* Configurable sampling.
* Offline buffering.
* Additional framework support.

## Observability

* Percentile latency.
* P50/P95/P99.
* Error grouping.
* Endpoint health scores.
* Alerting.
* Threshold notifications.

## AI

* Ask Observatory.
* Historical comparisons.
* Anomaly detection.
* Root-cause assistance.
* AI-generated incident summaries.

## Platform

* Teams.
* Multiple users per project.
* Roles and permissions.
* API key scopes.
* Webhooks.
* Alert integrations.

These are NOT V1 requirements.

---

# 38. Resume Description

Potential final resume description:

> Built an AI-powered API observability platform with a custom Express SDK, asynchronous metric processing using RabbitMQ, PostgreSQL analytics storage, and a React dashboard providing API performance insights and AI-generated recommendations.

Potential technical highlights:

```text
• Built a custom TypeScript Express SDK for automatic API telemetry collection.
• Designed asynchronous telemetry ingestion using RabbitMQ and background workers.
• Implemented PostgreSQL-based request analytics using Prisma.
• Developed JWT-based dashboard authentication and secure project API-key management.
• Built React analytics dashboards for traffic, latency, errors, status codes, and endpoint performance.
• Integrated Gemini-based AI analysis to generate contextual API performance insights.
• Implemented validation, structured logging, error handling, and security controls.
• Containerized the application using Docker and Docker Compose.
```

---

# Final Architecture

```text
                         API OBSERVATORY
                              │
              ┌───────────────┴────────────────┐
              │                                │
              ▼                                ▼
       Developer API                    React Dashboard
              │                                │
              ▼                                │
       Observatory SDK                         │
              │                                │
              │ HTTPS                          │
              ▼                                │
       ┌───────────────┐                       │
       │ Ingestion API │                       │
       └───────┬───────┘                       │
               │                               │
               ▼                               │
       ┌───────────────┐                       │
       │   RabbitMQ    │                       │
       └───────┬───────┘                       │
               │                               │
               ▼                               │
       ┌───────────────┐                       │
       │    Worker     │                       │
       └───────┬───────┘                       │
               │                               │
               ▼                               │
       ┌───────────────┐                       │
       │  PostgreSQL   │◄──────────────────────┤
       └───────┬───────┘                       │
               │                               │
               ▼                               │
       ┌───────────────┐                       │
       │ Analytics API │───────────────────────┤
       └───────┬───────┘                       │
               │                               │
               ▼                               │
       ┌───────────────┐                       │
       │  AI Service   │                       │
       └───────┬───────┘                       │
               │                               │
               └───────────────────────────────┘
```

The system should remain understandable, maintainable, and appropriately complex for an intermediate-level engineering project.

**Build deliberately. Understand the system. Don't over-engineer.**
