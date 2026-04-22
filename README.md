# OPL Studio UI

React + PatternFly dashboard for the OPL AI Software Development Crew.

## Features

- **Dashboard** — job overview with stats
- **AI Crew** — monitor agent status and activity per job
- **Tasks** — Kanban-style task board per job phase
- **Files** — browse and preview generated project files
- **Skills** — view and search skills available to agents
- **MTA Migration** — migration issue tracker with diff viewer
- **Refactor** — code refactoring workflow

## Quick Start

```bash
npm install
npm run dev        # Vite dev server on http://localhost:3000
```

The dev server proxies `/api/*` and `/health` to `http://localhost:8081` (or `VITE_DEV_PROXY_TARGET`).

## Build

```bash
npm run build      # Production build to dist/
```

## Container

```bash
podman build -t crew-frontend:latest -f Containerfile .
podman run -p 3000:8080 -e BACKEND_HOST=localhost crew-frontend:latest
```

The Nginx container proxies `/api/*` to `http://${BACKEND_HOST}:8080`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `""` (same origin) | API base URL for production build |
| `VITE_DEV_PROXY_TARGET` | `http://localhost:8081` | Backend URL for Vite dev proxy |
| `BACKEND_HOST` | `backend` | Backend hostname for Nginx proxy (container only) |

## Part of OPL AI Mono

This repo is a Git submodule of [opl-crew-mono](https://github.com/varkrish/opl-crew-mono). The mono repo dev compose orchestrates this frontend alongside the backend, skills service, and other components.

```bash
cd opl_ai_mono
git submodule update --init --recursive
podman compose -f dev-compose.yml up --build
```
