# Changelog

Project releases and notable changes are recorded in this file. Release Please updates release notes from Conventional Commits.

## Unreleased

### Added

- ChatGPT2API now pulls its English-language image from the separate GHCR repository, keeping its source outside Zenith.
- Muse2API can generate videos through a server-configured asynchronous gateway.
- Docker Compose now builds and runs Muse2API with a persistent browser-account store and a private shared API key.
- The workflow node library now shows the 10 nodes used by the current studio workflows, while saved workflows retain access to legacy node definitions.
- New video generation nodes and the video starter template use Muse2API by default.
- ChatGPT2API is the default image provider for new Generate Image nodes, with server-side endpoint and API key configuration.
- Text and prompt input cards can be edited directly on the workflow canvas.

### Fixed

- Keep Payload uploads in the Docker volume across app restarts and resolve asset previews through their local media route.
- Preserve the selected image provider when its default model changes.

## Previous workspace package releases

These entries combine package changelogs from before the repository adopted a single project changelog. Duplicate notes from frontend, backend, contracts, and utility packages are listed once.

### 0.2.1

- `ccc1538` Changed: Removed duplicate root source paths after moving modules into the frontend, backend, and contracts workspaces.

### 0.2.0

- `6628694` Added: Workflow and asset application services with repository ports, Payload adapters, and focused unit tests.
- `6628694` Fixed: Return a structured service-unavailable response when platform backend configuration is not available.
- `bdab3d6` Added: Moved studio presentation, shared layout, and route views into a reusable frontend workspace package.
- `bdab3d6` Changed: Reduced root Next.js frontend pages to route adapters.
- `6d24955` Added: Split the studio into reusable frontend, backend, contracts, and utility workspaces.
- `6d24955` Changed: Route handlers now delegate workflow and asset operations to backend application services.
- `98dc262` Added: Established reusable frontend, backend, contracts, and utility workspaces.
- `98dc262` Changed: Kept the Next.js deployment shell at the root and moved application modules behind explicit package boundaries.
- `6d24955` Added: Cross-platform pnpm scripts, Husky commit checks, release automation, CI workflows, and contributor/security guidance.
