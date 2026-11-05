# Znith AI Workflow Studio

Znith Studio is a visual workspace for authoring, validating, and running AI workflows. It combines a React Flow editor with a self-hosted Payload CMS, PostgreSQL, and server-side provider adapters.

## Run the app with Docker

Requirements: Docker Engine and the Docker Compose plugin.

```bash
docker compose up -d --build
```

Open [http://localhost:3001](http://localhost:3001) for the studio. Open [http://localhost:3001/admin](http://localhost:3001/admin) to create the first Payload administrator and manage workflows, executions, and media. The app creates a persistent Payload secret on first startup. Set `APP_PORT=3000` if that host port is free.

The database is available to host tools at `127.0.0.1:55432`; the app connects to it over the private Compose network. PostgreSQL data, uploaded files, and the generated secret are kept in named Docker volumes.

```bash
docker compose ps
docker compose logs -f app
docker compose down
```

`docker compose down` stops containers and preserves data. `docker compose down -v` permanently deletes the database, uploads, and generated secret.

For self-hosting, copy `.env.example` to `.env` and set `POSTGRES_PASSWORD`, the matching `DATABASE_URL`, `SITE_URL`, and optionally `PAYLOAD_SECRET` before building. Use a strong URL-safe PostgreSQL password and a long random Payload secret. `SITE_URL` is a build argument, so rebuild after changing it. Put the app behind HTTPS and back up the database and the `payload-uploads` and `payload-secrets` volumes.

Existing records in a separate CMS are not copied by this setup. Export and import them separately if you need to preserve them.

## Monorepo

The repository is a pnpm workspace. The root Next.js application owns the App Router and Payload Admin/API routes.

| Workspace               | Responsibility                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `fe/`                   | Frontend presentation, route components, and browser interactions                                  |
| `be/`                   | Workflow and asset use cases, Payload repositories, provider execution, and collection definitions |
| `packages/contracts/`   | Shared workflow types, Zod request contracts, node registry, provider catalog, and templates       |
| `packages/utils/`       | Reusable, framework-independent helpers                                                            |
| `src/app/`              | Next.js route adapters and generated Payload Admin/API routes                                      |
| `src/payload.config.ts` | Payload config, PostgreSQL adapter, and collection registration                                    |
| `docker-compose.yml`    | App and database services with persistent storage                                                  |

App Router handlers validate HTTP requests, application services coordinate use cases, repository ports define persistence needs, and Payload adapters implement those ports. Shared contracts stay independent of React and Payload.

## Local development without Docker

Requirements: Node.js `24.22.1` and pnpm `10.x`.

```bash
pnpm install
pnpm dev
```

Set `DATABASE_URL` and `PAYLOAD_SECRET` in `.env` first, and make sure PostgreSQL is running. When using the Compose database from the host, use `localhost:55432` in `DATABASE_URL` instead of the service hostname `database`. Development mode uses Payload's schema push for the local database. Production deployments use the committed Payload migrations.

## Product capabilities

- Create, search, duplicate, import, export, and delete workflows.
- Compose graphs with typed inputs and outputs, undo/redo, copy/paste, and layout controls.
- Validate acyclic dependencies and execute ready nodes concurrently with retry and timeout policies.
- Persist execution snapshots, node outputs, status, logs, and errors in Payload.
- Upload and reuse media from the Payload Media collection.
- Configure provider credentials with server-only environment variables such as `APP_OPENAI_API_KEY`.
- Image generation can use ChatGPT2API through `APP_CHATGPT2API_BASE_URL` and `APP_CHATGPT2API_API_KEY` in `.env`.

Image and video generation requires a compatible provider and model configuration. Output nodes currently preserve the provider's output reference and filename metadata; persistent media ingestion is a separate storage capability.

## Quality and releases

`pnpm verify` runs formatting checks, TypeScript checks, and unit tests. GitHub Actions runs the same checks on pushes and pull requests. Use `docker compose up -d --build` to build and run the production container stack locally.

Use `pnpm changeset` for user-visible changes. Changeset entries select `patch`, `minor`, or `major` and use release notes beginning with labels such as `Added:`, `Changed:`, or `Fixed:`.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [docs/architecture.md](docs/architecture.md). For the product, data, device, and cleanup assessment, see [docs/project-assessment.md](docs/project-assessment.md).
