# API Lens Express SDK

Express middleware that sends request metadata to API Lens without collecting request or response contents.

## Install

The package currently lives in this repository. From an application during local development, install it with:

```bash
npm install ../api-lens/sdk express
```

The SDK supports Node.js 20.6+ and Express 4.18 or 5. It requires no runtime dependency beyond Node's built-in `fetch`.

## Use

```ts
import express from "express";
import { apiLens } from "api-lens-sdk";

const app = express();

app.use(apiLens({
  apiKey: process.env.API_LENS_API_KEY!,
  // Defaults to http://localhost:5000/ingest. Configure this for your receiver.
  ingestionUrl: process.env.API_LENS_INGESTION_URL,
  timeoutMs: 1_000,
  onDeliveryError: (error) => console.warn("API Lens metrics were dropped:", error.message),
}));
```

Create an API key from the project's API key management endpoint and keep it in an environment variable. The key is sent as `Authorization: Bearer <key>`.

## Telemetry contract

For each completed response, the SDK asynchronously sends one JSON event:

```json
{
  "method": "GET",
  "route": "/users/:userId",
  "statusCode": 200,
  "latency": 12,
  "timestamp": "2026-11-13T10:00:00.000Z"
}
```

`route` uses Express's matched route template and mounted router prefix. Requests without a matched route use `/unmatched`; raw paths and query strings are never sent. The SDK does not inspect headers, cookies, query parameters, request bodies, or response bodies.

Delivery is best-effort: the request has a bounded timeout (1 second by default, maximum 30 seconds), runs after the host response has finished, and failures are dropped. An optional `onDeliveryError` callback can observe delivery failures; errors thrown by that callback are also isolated. Non-2xx receiver responses count as delivery failures.

## Run the sample and tests

From this directory:

```bash
npm install
npm test
npm run example
```

`npm run example` starts a sample Express application and a local mock telemetry receiver, makes a request, and prints the telemetry received. To run them separately, build first, then run `node examples/mock-receiver.mjs` and `node examples/sample-app.mjs` in separate terminals. Set `API_LENS_INGESTION_URL=http://localhost:5001/ingest` and `API_LENS_API_KEY=lens_example_key` for the sample app.

The SDK works with a mock or any compatible HTTP receiver; it does not depend on the Phase 5 ingestion API being implemented.
