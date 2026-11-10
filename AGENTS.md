# Zenith Studio

React, Next.js, and Tailwind CSS application packaged for self-hosted Docker. Durable Studio data is stored in browser IndexedDB; the server handles provider requests without persisting user records.

## Working instructions

- Read the installed Next.js documentation under `apps/studio/node_modules/next/dist/docs/` before changing routes, pages, components, caching, images, or metadata.
- Validate and allowlist every provider-compute request field on the server and return structured errors the UI can display.
- Keep browser CRUD in `apps/studio/src/lib/studio-local-api.ts` and persistence operations in `apps/studio/src/lib/studio-indexed-db.ts`.
- Keep binary media in the `assetFiles` IndexedDB store and its metadata in `media`.
- Do not introduce a server database, admin panel, or account authentication without an explicit user request.
- Provider credentials belong to the user's browser IndexedDB and must never be included in workflow exports, source control, or logs.
- Treat `.env` values as write-only. Never print or summarize secret values.

## Verification

For frontend changes, preview requested routes and fix runtime or build errors. Server Components cannot contain event handlers; use CSS or a Client Component boundary.

For production behavior, build and run the Compose stack, inspect `docker compose ps`, and visit the requested routes. Do not use source inspection or a successful compile as a substitute for runtime verification.

## Project structure

This repository is a pnpm monorepo:

- `apps/studio/` - Next.js app, frontend features, server provider routes, and local-data adapter
- `apps/studio/src/features/studio/` - Studio UI and browser interactions
- `apps/studio/src/lib/studio-indexed-db.ts` - IndexedDB database and object-store access
- `apps/studio/src/lib/studio-local-api.ts` - fetch-compatible browser CRUD adapter
- `apps/studio/src/server/` - request validation, provider execution, and media validation
- `apps/studio/src/migrations/` - historical PostgreSQL migrations retained for reference; not used by the current app
- `packages/contracts/` - workflow schemas, types, registry, provider catalog, and templates
- `packages/utils/` - framework-independent helpers
- `Dockerfile` and `docker-compose.yml` - app and provider gateways; no Studio database service

## Styling

The project uses Tailwind CSS v4. Use Tailwind utilities in JSX. Keep `styles.css` for the Tailwind import, shared theme tokens, and truly global base styles.

## Data and backend

Use the lightest stack that satisfies the request:

- Browser-local records and offline-capable tools: IndexedDB through the Studio adapter.
- Provider APIs, secrets needed by gateways, and third-party calls: Next.js route handlers without durable Studio persistence.

The current object stores are `workflows`, `executions`, `prompts`, `textAssets`, `media`, `assetFiles`, `generations`, and `settings`. Data is scoped to the browser profile and origin; it does not sync between devices.

## Secrets and environment variables

Gateway keys remain in server environment variables and Docker volumes. Provider keys configured in Studio Settings are stored in browser IndexedDB and sent only with provider requests. Never ask users to paste secrets into ordinary chat, code, comments, or documentation. Do not expose saved environment values in tool output.

## Docker and deployment

Start the stack with:

```bash
docker compose up -d --build
```

The Compose stack runs the app and provider gateways. `docker compose down -v` deletes gateway data and generated gateway keys; Studio records remain in the browser's IndexedDB. Do not delete or rename Docker, Compose, or toolchain files without a user request. Keep the historical migration files unless the user explicitly requests their removal.

## Toolchain

- The dev server listens on `$PORT` (default 3000); do not hardcode a development port.
- Use pnpm to manage workspace dependencies and keep `pnpm-lock.yaml` synchronized.
- Keep release history in the root `CHANGELOG.md`; do not add package-specific changelogs.
- Toolchain versions are managed by `.mise.toml`.
- Check `package.json` before adding dependencies. This project uses Next.js App Router, React 19, and Tailwind CSS v4.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may differ from older Next.js versions. Read the relevant installed guide in `node_modules/next/dist/docs/` and follow its deprecation notes.

This block is maintained by `next dev`; see `node_modules/next/dist/server/lib/generate-agent-files.js` if it changes automatically.

<!-- END:nextjs-agent-rules -->
