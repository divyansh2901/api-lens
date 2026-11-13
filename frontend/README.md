# API Lens Dashboard

The React 19 + TypeScript dashboard displays live analytics from the API Lens backend. It uses Vite, Tailwind CSS v4, Recharts, and a NeoBrutalism-inspired visual system: warm paper surfaces, yellow/purple/coral accents, heavy ink borders, hard offset shadows, and tactile controls. Components are written locally around those patterns to keep the design compatible with this project without introducing a shadcn/Base UI runtime dependency.

## Run locally

From the repository root, start the backend first (see the root README), then run:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to `http://localhost:5000`. Set `API_LENS_BACKEND_URL` when starting Vite to point at a different backend origin.

The production build is created in the root `dist/` directory:

```bash
npm run build
npm run preview
```

For deployments, route dashboard `/api` requests through a same-origin reverse proxy to the backend. If the frontend calls a different API origin, set `VITE_API_BASE_URL` to that public origin and configure backend CORS with the dashboard origin. Only a public API base URL belongs in frontend variables; never provide JWT secrets, database credentials, RabbitMQ URLs, or other backend secrets.

## Dashboard features

- Signup and login use `/api/auth/signup` and `/api/auth/login`; the returned JWT is sent as a Bearer token for protected requests.
- Project listing, creation, deletion, selection, API-key generation, and revocation use the existing `/api/projects` endpoints. Newly generated API keys are shown once and are never persisted by the dashboard.
- Analytics use all seven Phase 7 endpoints: overview, traffic, status-code distribution, top endpoints, slowest endpoints, endpoint errors, and paginated recent requests.
- Time filters map to the API's `1h`, `24h`, `7d`, and `30d` presets. Empty datasets and request failures have explicit states.

Analytics endpoint contracts and response examples are documented in [the backend analytics reference](../backend/ANALYTICS_API.md).
