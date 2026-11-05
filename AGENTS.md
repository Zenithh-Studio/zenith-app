# Znith Studio

React, Next.js, Payload CMS, PostgreSQL, and Tailwind CSS application packaged for self-hosted Docker.

## Working instructions

- Use the Payload framework guidance available in the workspace when working on Payload configuration, collections, access, or migrations.
- Read the installed Next.js documentation under `apps/studio/node_modules/next/dist/docs/` before changing routes, pages, components, caching, images, or metadata.
- For user-facing document mutations, validate and allowlist every submitted field on the server and return structured errors the UI can display.
- User-facing Payload Local API calls must set `overrideAccess: false` and pass the authenticated user when one exists.
- Preserve the document ID type generated in `apps/studio/src/payload-types.ts`; do not assume IDs are numeric.
- Protect server-owned workflow fields with field-level create/update access and enforce durable relationship rules at the collection boundary.
- Model durable records, uploads, and admin-managed content in Payload. Use the Payload CLI for data operations.
- Keep provider keys, `PAYLOAD_SECRET`, and database credentials server-side. Never put private values in client bundles, workflow exports, source control, or logs.

## Verification

For frontend changes, preview requested routes and fix runtime or build errors. Server Components cannot contain event handlers; use CSS or a Client Component boundary.

For production behavior, build and run the Compose stack, inspect `docker compose ps`, and visit the requested routes. Do not use source inspection or a successful compile as a substitute for runtime verification.

For Payload-managed images, pass the upload URL (`media.url`) to `next/image`. Keep the uploads directory on its persistent Docker volume and verify nonzero image dimensions after upload or replacement.

## Project structure

This repository is a pnpm monorepo:

- `apps/studio/` - Next.js and Payload application, its routes, server modules, frontend features, and migrations
- `apps/studio/src/features/studio/` - Studio presentation, route views, shared layout, and styles
- `apps/studio/src/server/` - Collections, domain ports, application services, persistence adapters, and workflow engine
- `apps/studio/src/app/(frontend)/` - Next.js pages and API route adapters
- `apps/studio/src/app/(payload)/` - Generated Payload Admin and API routes; do not hand-edit
- `apps/studio/src/payload.config.ts` - Payload/PostgreSQL composition root
- `apps/studio/src/payload-types.ts` - Automatically generated TypeScript types
- `apps/studio/src/migrations/` - Payload database migrations
- `packages/contracts/` - Shared workflow schemas, types, registry, provider catalog, and templates
- `packages/utils/` - Framework-independent shared utilities
- `CHANGELOG.md` - Project-wide release history; do not add package-specific changelogs
- `Dockerfile` and `docker-compose.yml` - App and PostgreSQL services

## Styling

The project uses Tailwind CSS v4. Use Tailwind utilities in JSX. Keep `styles.css` for the Tailwind import, shared theme tokens, and truly global base styles. Follow installed design-system components and tokens when present.

## Data and backend

Use the lightest stack that satisfies the request:

- Static UI, local browser state, or offline tools: no backend.
- Server-side compute, secrets, OAuth, email, webhooks, or third-party API calls without durable local data: Next.js server components, actions, or route handlers.
- Durable records, uploads, users, or admin-managed content: Payload CMS with the PostgreSQL adapter.

Use `buildConfig()` and `postgresAdapter()` in `apps/studio/src/payload.config.ts`. Store upload files in the configured uploads directory. Keep the database, upload, and signing-secret volumes persistent. Use local schema push during development and committed migrations for production deployments.

Do not hand-edit Payload generated files. Regenerate types and the Admin import map with the Payload CLI when the config changes.

## Secrets and environment variables

Use `DATABASE_URL` and `PAYLOAD_SECRET` on the server. Docker creates a persistent signing secret on first startup when one is not supplied. For a public deployment, configure strong production credentials in the deployment environment. Third-party integration keys remain server-only.

Never ask users to paste secrets into ordinary chat, code, comments, or documentation. Do not print, log, summarize, or expose secret values. Treat saved environment values as write-only. `NEXT_PUBLIC_*` values may be bundled into browser code and must be public.

## Payload data integrity and schema safety

For user-facing mutations, validate and allowlist every submitted field. Enforce relationship eligibility and other durable invariants at collection boundaries, not only in a Server Action.

Before changing an existing Payload schema, classify the change:

- Additive optional fields, collections, and relationships can usually proceed with a concise preview.
- Deletes, renames, type changes, required/unique constraints, relationship cardinality changes, bulk updates, and document deletes require an operation-specific confirmation before making the change.
- Preserve existing data meaning or document a migration plan. Code rollback does not roll back Payload data.

Use relationships for independently managed domain concepts. Model content images as upload relationships to the existing `media` collection. Avoid parallel URL fields or hardcoded frontend media data.

Keep useful empty states and handle absent optional relationships safely. Public detail records normally need a unique indexed slug and should use `findBySlug()` from `apps/studio/src/lib/payload.ts` with `notFound()` for missing documents.

## Authentication

Payload Admin authentication uses the local email/password strategy on the `admins` collection. Keep it distinct from any generated app-user authentication. Do not use Admin accounts for public app signup or grant public users Payload Admin access.

When implementing public app signup, login, profiles, roles, or user-owned records, create a separate auth-enabled `users` collection and use a vetted server-side auth approach. Do not create password/session handling from scratch.

## Docker and deployment

Start the app and database together with:

```bash
docker compose up -d --build
```

PostgreSQL must pass its health check before the app starts. The Payload adapter applies committed production migrations on startup. Do not delete or rename the Docker, Compose, migration, or toolchain files. `docker compose down -v` deletes the persistent database, uploaded files, and generated secret.

## Toolchain

- The dev server listens on `$PORT` (default 3000); do not hardcode a development port.
- Use pnpm to add workspace dependencies and keep `pnpm-lock.yaml` synchronized.
- Keep release history in the root `CHANGELOG.md`; Release Please builds release notes from Conventional Commits.
- Toolchain versions are managed by `.mise.toml`.
- Check `package.json` before adding dependencies. This project uses Next.js App Router, React 19, Payload, and Tailwind CSS v4.
- Keep environment files out of source control.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may differ from older Next.js versions. Read the relevant installed guide in `node_modules/next/dist/docs/` before editing and follow its deprecation notes.

This block is maintained by `next dev`; see `node_modules/next/dist/server/lib/generate-agent-files.js` if it changes automatically.

<!-- END:nextjs-agent-rules -->
