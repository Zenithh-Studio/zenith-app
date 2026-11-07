# CHANGELOG

Project releases and notable user-facing changes are recorded here. Release Please updates the versioned release section from Conventional Commits.

## Unreleased

### [Added]

- ChatGPT2API now pulls its English-language image from the separate GHCR repository, keeping its source outside Zenith.
- Muse2API can generate videos through a server-configured asynchronous gateway.
- Docker Compose builds and runs Muse2API with a persistent browser-account store and a private shared API key.
- The workflow node library shows the nodes used by current studio workflows while saved workflows retain access to legacy definitions.
- New video generation nodes and the video starter template use Muse2API by default.
- ChatGPT2API is the default image provider for new Generate Image nodes, with server-side endpoint and API key configuration.
- Text and prompt input cards can be edited directly on the workflow canvas.

### [Fixed]

- Payload uploads persist in the Docker volume across app restarts and resolve previews through the local media route.
- The selected image provider remains selected when its default model changes.

## Package history archive

The entries below preserve package-level history from before the workspace adopted a single project version. They are not project-wide releases.

### `@znith/contracts` 0.2.1

- `ccc1538` Removed duplicate root source paths after moving modules into the frontend, backend, and contracts workspaces.

### Workspace packages 0.2.0

- `6628694` Added workflow and asset application services with Payload adapters and focused unit tests.
- `6628694` Fixed the service-unavailable response when platform backend configuration is unavailable.
- `bdab3d6` Moved studio presentation, shared layout, and route views into a reusable frontend workspace package.
- `bdab3d6` Reduced root Next.js frontend pages to route adapters.
- `6d24955` Split the studio into reusable frontend, backend, contracts, and utility workspaces.
- `6d24955` Routed workflow and asset operations through backend application services.
- `98dc262` Established reusable frontend, backend, contracts, and utility workspaces.
- `98dc262` Kept the Next.js deployment shell at the root and moved application modules behind explicit package boundaries.
- `6d24955` Added cross-platform pnpm scripts, Husky commit checks, release automation, CI workflows, and contributor/security guidance.
