# Znith AI Workflow Studio

Znith Studio is a visual workspace for authoring, validating, and running AI workflows. It combines a React Flow editor with a self-hosted Payload CMS, PostgreSQL, and server-side provider adapters.

## Run the app with Docker

Requirements: Docker Engine and the Docker Compose plugin.

```bash
docker compose up -d --build
```

The Compose stack starts the studio, PostgreSQL, ChatGPT2API, and Muse2API. Set `CHATGPT2API_AUTH_KEY` in `.env` before the first start; generate a private value with `openssl rand -hex 32`. The same value is passed to the gateway and the studio server. If you use `APP_CHATGPT2API_API_KEY` instead, Compose uses it as a fallback. Do not put provider keys in a workflow or commit them.

ChatGPT2API is maintained in its own [GitHub repository](https://github.com/Zenithh-Studio/ChatGPT2API) and published as `ghcr.io/zenithh-studio/chatgpt2api:v3.2.3-en.1`; Muse2API is published from [its repository](https://github.com/Zenithh-Studio/muse2api) as `ghcr.io/zenithh-studio/muse2api:main`. Zenith Compose pulls both images when they are missing locally. The ChatGPT2API GHCR package is private, so authenticate with `docker login ghcr.io -u <GitHub username>` and a token with `read:packages` before the first pull on each machine. Muse2API's package must be switched to Public in GHCR package settings after its first successful publish; then it can be pulled without login. Set `MUSE2API_IMAGE` in `.env` to pin another tag or digest. On a new machine, copy the Zenith repository and `.env`, then run `docker compose up -d --build`. To force an update of the mutable Muse2API `main` tag when it is already cached, run `docker compose pull muse2api` before `docker compose up -d`. To preserve ChatGPT sessions, settings, and generated files, migrate the `chatgpt2api-data` volume and `chatgpt2api.config.json`; `chatgpt2api-runtime` holds application files and is recreated from the image.

Open [http://localhost:3001](http://localhost:3001) for the studio and [http://localhost:3001/admin](http://localhost:3001/admin) to create the first Payload administrator. Open [http://localhost:3000](http://localhost:3000) to configure ChatGPT2API and add the ChatGPT account(s) it will use. Muse2API's dashboard is at [http://localhost:18610/dashboard](http://localhost:18610/dashboard). The app creates a persistent Payload secret on first startup. If port 3001 is occupied, set `APP_PORT` to another free port; if port 3000 is occupied, set `CHATGPT2API_PORT` to another free port; if port 18610 is occupied, set `MUSE2API_PORT` to another free port.

Muse2API runs with the browser driver and stores its account sessions and generated media in the persistent `muse2api-data` volume. On the dashboard's Accounts page, download the cookie-import extension, load it into Chrome or Edge, sign in to muse.ai, and import the account to the local gateway (`http://localhost:18610`). Distinct API and admin keys are generated into separate Docker volumes; only the API key volume is mounted read-only into the studio. To use the admin key in the cookie-import extension, read it locally with `docker compose exec muse2api sh -c 'cat /run/muse2api-admin/admin_key'`; do not paste it into workflows or commit it. The API key remains private to the app and gateway. After importing an account, add a Generate Video node, choose Muse2API as its provider, connect a prompt (and optionally one first-frame image), then run the workflow. The upstream browser driver still needs live testing against real muse.ai accounts; see the [Muse2API setup guide](https://github.com/Zenithh-Studio/muse2api#quick-start).

The database is available to host tools at `127.0.0.1:55432`; the app connects to it over the private Compose network. PostgreSQL data, uploaded files, and the generated secret are kept in named Docker volumes.

```bash
docker compose ps
docker compose logs -f app
docker compose down
```

`docker compose down` stops containers and preserves data. `docker compose down -v` permanently deletes the database, uploads, generated secrets, and Muse2API account sessions/media.

For self-hosting, copy `.env.example` to `.env` and set `POSTGRES_PASSWORD`, `SITE_URL`, and optionally `PAYLOAD_SECRET` before building. Compose constructs the app's internal database URL from `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`; set `APP_DATABASE_URL` only when the app should use an external PostgreSQL server. Use a strong URL-safe PostgreSQL password and a long random Payload secret. `SITE_URL` is a build argument, so rebuild after changing it. Put the app behind HTTPS and back up the database and the `payload-uploads` and `payload-secrets` volumes.

Existing records in a separate CMS are not copied by this setup. Export and import them separately if you need to preserve them.

## Monorepo

The repository is a pnpm monorepo. `apps/studio/` is the Next.js application and owns the App Router and Payload Admin/API routes.

| Workspace                 | Responsibility                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/studio/`            | Next.js app, frontend features, server modules, and Payload configuration                    |
| `packages/contracts/`     | Shared workflow types, Zod request contracts, node registry, provider catalog, and templates |
| `packages/utils/`         | Reusable, framework-independent helpers                                                      |
| `apps/studio/src/app/`    | Next.js route adapters and generated Payload Admin/API routes                                |
| `apps/studio/src/server/` | Workflow and asset use cases, Payload repositories, provider execution, and collections      |
| `docker-compose.yml`      | App, database, and image/video provider gateways with persistent storage                     |

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
- Video generation can use Muse2API for text-to-video or first-frame image-to-video. The app submits and polls asynchronous tasks, then saves completed output to Assets.

Muse2API is a third-party gateway to the muse.ai web app, not an official Meta video API. The Compose setup pulls the published gateway image, defaults to its browser driver, and gives the studio a private service-network endpoint. Configure the real account in Muse2API's dashboard before generating videos; the upstream project currently marks the browser driver as needing live tests with a real muse.ai account. See the [Muse2API setup guide](https://github.com/Zenithh-Studio/muse2api#quick-start).

Image and video generation requires a compatible provider and model configuration. Generated media is copied to Payload Assets when the provider returns a downloadable URL.

## Quality and releases

`pnpm verify` runs Prettier checks, ESLint, TypeScript checks, and unit tests. GitHub Actions runs the same checks on pushes and pull requests. Use `docker compose up -d --build` to build and run the production container stack locally.

Release Please reads Conventional Commits on `main`, opens a release pull request, and updates the project-wide [CHANGELOG.md](CHANGELOG.md). Release history is kept in that root file.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [docs/architecture.md](docs/architecture.md). For the product, data, device, and cleanup assessment, see [docs/project-assessment.md](docs/project-assessment.md).
