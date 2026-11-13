# API Lens Analytics API

All analytics endpoints require a dashboard JWT in `Authorization: Bearer <JWT>` and verify that the authenticated user owns the requested project. Analytics are calculated from `RequestLog` records.

Base path:

```text
/api/analytics/:projectId
```

Every endpoint accepts one of the preset ranges `1h`, `24h`, `7d`, or `30d`. The default is `24h`. For a custom range, send both ISO-8601 `from` and `to` timestamps instead of `range`; `from` must be earlier than `to`, the range cannot exceed 30 days, and `to` cannot be in the future. Time windows include `from` and exclude `to`.

```http
GET /api/analytics/PROJECT_ID/overview?range=24h
Authorization: Bearer YOUR_JWT
```

## Overview

```http
GET /api/analytics/PROJECT_ID/overview?range=24h
```

Returns total requests, average latency in milliseconds, failed/successful request counts, and rates as percentages. Status codes `400` and higher count as errors.

```json
{
  "success": true,
  "data": {
    "projectId": "PROJECT_ID",
    "range": {
      "preset": "24h",
      "from": "2026-11-12T12:00:00.000Z",
      "to": "2026-11-13T12:00:00.000Z"
    },
    "metrics": {
      "totalRequests": 1200,
      "averageLatencyMs": 143.25,
      "errorCount": 36,
      "successCount": 1164,
      "errorRate": 3,
      "successRate": 97
    }
  }
}
```

## Traffic over time

```http
GET /api/analytics/PROJECT_ID/traffic?from=2026-11-13T11:57:00.000Z&to=2026-11-13T12:00:00.000Z
```

The server selects one-minute, one-hour, six-hour, or one-day buckets based on range length. Empty buckets are included with zero requests.

```json
{
  "success": true,
  "data": {
    "projectId": "PROJECT_ID",
    "range": {
      "preset": "custom",
      "from": "2026-11-13T11:57:00.000Z",
      "to": "2026-11-13T12:00:00.000Z"
    },
    "interval": "1 minute",
    "data": [
      { "timestamp": "2026-11-13T11:57:00.000Z", "requestCount": 8, "averageLatencyMs": 120 },
      { "timestamp": "2026-11-13T11:58:00.000Z", "requestCount": 0, "averageLatencyMs": 0 },
      { "timestamp": "2026-11-13T11:59:00.000Z", "requestCount": 5, "averageLatencyMs": 202.4 }
    ]
  }
}
```

## HTTP status-code distribution

```http
GET /api/analytics/PROJECT_ID/status-codes?range=7d
```

Each percentage is the share of all project requests in the selected range.

```json
{
  "success": true,
  "data": {
    "projectId": "PROJECT_ID",
    "range": { "preset": "7d", "from": "2026-11-06T12:00:00.000Z", "to": "2026-11-13T12:00:00.000Z" },
    "data": [
      { "statusCode": 200, "count": 9300, "percentage": 96.88 },
      { "statusCode": 404, "count": 250, "percentage": 2.6 },
      { "statusCode": 500, "count": 50, "percentage": 0.52 }
    ]
  }
}
```

## Top endpoints by request count

```http
GET /api/analytics/PROJECT_ID/top-endpoints?range=24h
```

Returns up to 10 method and route-template pairs, ordered by request count descending.

```json
{
  "success": true,
  "data": {
    "projectId": "PROJECT_ID",
    "range": { "preset": "24h", "from": "2026-11-12T12:00:00.000Z", "to": "2026-11-13T12:00:00.000Z" },
    "data": [
      { "method": "GET", "route": "/products", "requestCount": 840 },
      { "method": "POST", "route": "/orders", "requestCount": 220 }
    ]
  }
}
```

## Slowest endpoints

```http
GET /api/analytics/PROJECT_ID/slowest-endpoints?range=30d
```

Returns up to 10 route and method pairs ordered by average latency descending.

```json
{
  "success": true,
  "data": {
    "projectId": "PROJECT_ID",
    "range": { "preset": "30d", "from": "2026-10-14T12:00:00.000Z", "to": "2026-11-13T12:00:00.000Z" },
    "data": [
      { "method": "GET", "route": "/reports/:id", "requestCount": 58, "averageLatencyMs": 812.34 }
    ]
  }
}
```

## Endpoints with the highest error rates

```http
GET /api/analytics/PROJECT_ID/endpoint-errors?range=7d
```

Only endpoint pairs with at least one `4xx` or `5xx` response are returned, ordered by error rate descending. Results are limited to 10.

```json
{
  "success": true,
  "data": {
    "projectId": "PROJECT_ID",
    "range": { "preset": "7d", "from": "2026-11-06T12:00:00.000Z", "to": "2026-11-13T12:00:00.000Z" },
    "data": [
      { "method": "POST", "route": "/payments", "requestCount": 40, "errorCount": 12, "errorRate": 30 },
      { "method": "GET", "route": "/reports/:id", "requestCount": 100, "errorCount": 8, "errorRate": 8 }
    ]
  }
}
```

## Recent requests

```http
GET /api/analytics/PROJECT_ID/recent-requests?page=2&limit=20&range=1h
```

`page` defaults to 1 and `limit` defaults to 20; limits from 1 to 100 are accepted. Requests are ordered newest first. The result includes the total matching count and total pages.

```json
{
  "success": true,
  "data": {
    "projectId": "PROJECT_ID",
    "range": { "preset": "1h", "from": "2026-11-13T11:00:00.000Z", "to": "2026-11-13T12:00:00.000Z" },
    "pagination": { "page": 2, "limit": 20, "total": 57, "totalPages": 3 },
    "data": [
      {
        "id": "REQUEST_LOG_ID",
        "method": "GET",
        "route": "/products/:id",
        "statusCode": 200,
        "latency": 46,
        "timestamp": "2026-11-13T11:58:16.000Z"
      }
    ]
  }
}
```

Invalid ranges or pagination return `400 VALIDATION_ERROR`. Missing or unowned projects return `404 PROJECT_NOT_FOUND`. All responses use the shared `{ success, data }` or `{ success, error }` envelope.

For Gemini-generated summaries and analytics-grounded questions, see the [AI Analytics API reference](AI_API.md).
