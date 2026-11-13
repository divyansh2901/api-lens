# API Lens AI Analytics API

AI features use Google's official [`@google/genai`](https://googleapis.github.io/js-genai/) JavaScript SDK on the backend. Both endpoints require the dashboard JWT and verify project ownership through the Phase 7 analytics service. Gemini receives aggregated metrics and route-level summaries only; it has no database tools, raw request records, headers, bodies, API keys, or unrestricted query access.

The configured model is `GEMINI_MODEL` (default `gemini-3.8-flash`). `GEMINI_API_KEY` stays in the backend environment. If it is missing, the backend continues serving Phases 1–8 and AI requests return `503 AI_NOT_CONFIGURED`. Each user is limited to 10 AI requests per 10-minute window per backend process. Gemini provider timeouts use `GEMINI_TIMEOUT_MS` (default 20 seconds; accepted range 1–120 seconds).

AI endpoints accept the same preset time ranges as analytics: `1h`, `24h`, `7d`, or `30d`; default is `24h`. Custom `from` and `to` ISO timestamps are also supported, with the same 30-day and future-date validation.

## Generate project insights

```http
GET /api/analytics/PROJECT_ID/insights?range=24h
Authorization: Bearer YOUR_JWT
```

The model returns an executive summary, measured observations with evidence, possible explanations (explicitly tentative), and actionable recommendations.

```json
{
  "success": true,
  "data": {
    "range": { "preset": "24h", "from": "2026-11-12T12:00:00.000Z", "to": "2026-11-13T12:00:00.000Z" },
    "generatedAt": "2026-11-13T12:10:00.000Z",
    "executiveSummary": "Request volume is steady, while one report route is slower than the rest.",
    "observations": [
      {
        "category": "latency",
        "title": "Slow report route",
        "fact": "GET /reports averages 812 ms across 58 requests.",
        "evidence": "This is the highest average latency among endpoints returned for the selected range."
      }
    ],
    "possibleExplanations": [
      "The route may be doing expensive work; request-level traces and code are not available to confirm this."
    ],
    "recommendations": [
      { "action": "Profile GET /reports", "rationale": "It has the highest measured average latency." }
    ],
    "source": "analytics-api"
  }
}
```

If the selected range has no stored requests, the server returns a deterministic empty-data summary without calling Gemini.

## Ask Observatory

```http
POST /api/analytics/PROJECT_ID/ask?range=7d
Authorization: Bearer YOUR_JWT
Content-Type: application/json

{ "question": "Which endpoint is slowest, and what should I investigate?" }
```

Questions must contain 3–500 characters. The answer uses only the same scoped analytics aggregates, and returns observed facts separately from uncertain explanations.

```json
{
  "success": true,
  "data": {
    "answer": "GET /reports has the highest average latency in the selected period.",
    "observedFacts": ["GET /reports averaged 812 ms across 58 requests."],
    "possibleExplanations": ["It may involve expensive database or application work; available metrics cannot determine which."],
    "recommendations": ["Profile the handler and its database calls before changing code."],
    "range": { "preset": "7d", "from": "2026-11-06T12:00:00.000Z", "to": "2026-11-13T12:00:00.000Z" },
    "generatedAt": "2026-11-13T12:10:00.000Z"
  }
}
```

## Errors

Errors use the shared `{ "success": false, "error": { "code", "message" } }` shape.

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid date range, body, or question length |
| 401 | `UNAUTHORIZED` | Missing or invalid dashboard JWT |
| 404 | `PROJECT_NOT_FOUND` | Project does not exist or is not owned by the user |
| 429 | `AI_RATE_LIMITED` | Application request budget or Gemini quota/rate limit reached |
| 502 | `AI_PROVIDER_ERROR`, `AI_INVALID_RESPONSE` | Provider failure or invalid structured model output |
| 503 | `AI_NOT_CONFIGURED`, `AI_CONFIGURATION_ERROR` | Gemini key missing or rejected |
| 504 | `AI_TIMEOUT` | Gemini exceeded the configured timeout |

Model output is constrained to a JSON schema and validated again with Zod before returning it. Treat AI recommendations as suggestions: explanations are hypotheses, not diagnoses.
