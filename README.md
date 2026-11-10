# Znith AI Workflow Studio

Znith Studio is a local-first visual workspace for authoring, validating, and running AI workflows. It combines a React Flow editor with browser IndexedDB storage and server-side provider adapters for AI requests.

## Run the app with Docker

Requirements: Docker Engine and the Docker Compose plugin.

```bash
docker compose up -d --build
```

The Compose stack starts the studio, ChatGPT2API, and Muse2API. Set `CHATGPT2API_AUTH_KEY` in `.env` before the first start; generate a private value with `openssl rand -hex 32`. The same value is passed to the gateway and the studio server. If you use `APP_CHATGPT2API_API_KEY` instead, Compose uses it as a fallback. Do not put provider keys in a workflow or commit them.

ChatGPT2API is maintained in its own [GitHub repository](https://github.com/Zenithh-Studio/ChatGPT2API) and published as `ghcr.io/zenithh-studio/chatgpt2api:v3.2.3-en.1`; Muse2API is published from [its repository](https://github.com/Zenithh-Studio/muse2api) as `ghcr.io/zenithh-studio/muse2api:main`. Zenith Compose pulls both images when they are missing locally. The ChatGPT2API GHCR package is private, so authenticate with `docker login ghcr.io -u <GitHub username>` and a token with `read:packages` before the first pull on each machine. Muse2API's package must be switched to Public in GHCR package settings after its first successful publish; then it can be pulled without login. Set `MUSE2API_IMAGE` in `.env` to pin another tag or digest. On a new machine, copy the Zenith repository and `.env`, then run `docker compose up -d --build`. To force an update of the mutable Muse2API `main` tag when it is already cached, run `docker compose pull muse2api` before `docker compose up -d`. To preserve ChatGPT sessions, settings, and generated files, migrate the `chatgpt2api-data` volume and `chatgpt2api.config.json`; `chatgpt2api-runtime` holds application files and is recreated from the image.

Open [http://localhost:3001](http://localhost:3001) for the studio. Open [http://localhost:3000](http://localhost:3000) to configure ChatGPT2API and add the ChatGPT account(s) it will use. Muse2API's dashboard is at [http://localhost:18610/dashboard](http://localhost:18610/dashboard). If port 3001 is occupied, set `APP_PORT` to another free port; if port 3000 is occupied, set `CHATGPT2API_PORT` to another free port; if port 18610 is occupied, set `MUSE2API_PORT` to another free port.

Muse2API runs with the browser driver and stores its account sessions and generated media in the persistent `muse2api-data` volume. On the dashboard's Accounts page, download the cookie-import extension, load it into Chrome or Edge, sign in to muse.ai, and import the account to the local gateway (`http://localhost:18610`). Distinct API and admin keys are generated into separate Docker volumes; only the API key volume is mounted read-only into the studio. To use the admin key in the cookie-import extension, read it locally with `docker compose exec muse2api sh -c 'cat /run/muse2api-admin/admin_key'`; do not paste it into workflows or commit it. The API key remains private to the app and gateway. After importing an account, add a Generate Video node, choose Muse2API as its provider, connect a prompt (and optionally one first-frame image), then run the workflow. The upstream browser driver still needs live testing against real muse.ai accounts; see the [Muse2API setup guide](https://github.com/Zenithh-Studio/muse2api#quick-start).

Workflows, executions, prompts, text assets, media records, media files, generations, and settings live in the browser's `zenith-studio` IndexedDB database. Data is scoped to the browser profile and site origin; it does not sync between devices. The Compose stack has no Studio database service.

```bash
docker compose ps
docker compose logs -f app
docker compose down
```

`docker compose down` stops containers and preserves gateway data. `docker compose down -v` permanently deletes ChatGPT2API and Muse2API data and generated gateway keys. Studio records remain in the browser's IndexedDB.

For self-hosting, copy `.env.example` to `.env` and set `SITE_URL` before building. `SITE_URL` is a build argument, so rebuild after changing it. Put the app behind HTTPS. Back up gateway volumes separately; export Studio records from the browser if you need a portable copy.

The previous PostgreSQL-backed Studio records are not imported automatically into browser IndexedDB. A local backup was made before the old database was removed.

## Monorepo

The repository is a pnpm monorepo. `apps/studio/` is the Next.js application and owns the App Router and local-first Studio UI.

| Workspace                 | Responsibility                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/studio/`            | Next.js app, frontend features, and stateless provider routes                                |
| `packages/contracts/`     | Shared workflow types, Zod request contracts, node registry, provider catalog, and templates |
| `packages/utils/`         | Reusable, framework-independent helpers                                                      |
| `apps/studio/src/app/`    | Next.js pages and API routes for provider compute                                            |
| `apps/studio/src/server/` | Workflow execution, media validation, and provider adapters                                 |
| `docker-compose.yml`      | App and image/video provider gateways with persistent gateway storage                       |

The browser stores durable Studio records in IndexedDB. App Router handlers validate provider-compute requests and return results for the browser to persist locally. Shared contracts stay independent of React and the server runtime.

## Local development without Docker

Requirements: Node.js `24.22.1` and pnpm `10.x`.

```bash
pnpm install
pnpm dev
```

No database service is required. Start the app with `pnpm dev`; Studio data is stored in the active browser's IndexedDB.

## Product capabilities

- Create, search, duplicate, import, export, and delete workflows.
- Compose graphs with typed inputs and outputs, undo/redo, copy/paste, and layout controls.
- Validate acyclic dependencies and execute ready nodes concurrently with retry and timeout policies.
- Persist execution snapshots, node outputs, status, logs, and errors in IndexedDB.
- Upload and reuse media in the browser's IndexedDB, with binary files stored separately from metadata.
- Configure provider credentials in Studio Settings; credentials are stored in the browser's IndexedDB and sent to the server only with provider requests.
- Image generation can use ChatGPT2API through `APP_CHATGPT2API_BASE_URL` and `APP_CHATGPT2API_API_KEY` in `.env`.
- Video generation can use Muse2API for text-to-video or first-frame image-to-video. The app submits and polls asynchronous tasks, then saves completed output to Assets.

Muse2API is a third-party gateway to the muse.ai web app, not an official Meta video API. The Compose setup pulls the published gateway image, defaults to its browser driver, and gives the studio a private service-network endpoint. Configure the real account in Muse2API's dashboard before generating videos; the upstream project currently marks the browser driver as needing live tests with a real muse.ai account. See the [Muse2API setup guide](https://github.com/Zenithh-Studio/muse2api#quick-start).

Image and video generation requires a compatible provider and model configuration. Generated media is returned to the browser and saved in IndexedDB.

## Quality and releases

`pnpm verify` runs Prettier checks, ESLint, TypeScript checks, and unit tests. GitHub Actions runs the same checks on pushes and pull requests. Use `docker compose up -d --build` to build and run the production container stack locally.

Release Please reads Conventional Commits on `main`, opens a release pull request, and updates the project-wide [CHANGELOG.md](CHANGELOG.md). Release history is kept in that root file.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [docs/architecture.md](docs/architecture.md). For the product, data, device, and cleanup assessment, see [docs/project-assessment.md](docs/project-assessment.md).
