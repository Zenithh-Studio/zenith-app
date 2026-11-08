# CHANGELOG

Project releases and notable user-facing changes are recorded here. Release Please updates the versioned release section from Conventional Commits.

## Unreleased

## v0.3.0 - 2026-11-08

### [Added]

- Public app accounts, owner-scoped workflows, assets, prompts, settings, and Studio history, with encrypted write-only provider credentials and admin-managed storage quotas.
- Image Studio, Video Studio, Prompt Library, per-user settings, typed asset search, and persistent generation history.
- Recoverable video task polling, retry provenance, workflow group containers and scoped DAG execution, plus audio input, generation, and save nodes.
- Workflow node actions for inline rename, redacted diagnostics, execution JSON, output history, retry, task status, and saving generated media to Assets.
- Local crop, split, and Lanczos upscale tools, with provider-backed image description, edit, variation, angle, and super-resolution adapters.
- Responsive mobile navigation, a workflow side panel and bottom dock, keyboard help, and English/Vietnamese locale preferences.
- ChatGPT2API now pulls its English-language image from the separate GHCR repository, keeping its source outside Zenith.
- Muse2API can generate videos through a server-configured asynchronous gateway.
- Docker Compose builds and runs Muse2API with a persistent browser-account store and a private shared API key.
- The workflow node library shows the nodes used by current studio workflows while saved workflows retain access to legacy definitions.
- New video generation nodes and the video starter template use Muse2API by default.
- ChatGPT2API is the default image provider for new Generate Image nodes, with server-side endpoint and API key configuration.
- Text and prompt input cards can be edited directly on the workflow canvas.
- Image Studio and image nodes support custom resolution, width and height, and generated image count; Video Studio accepts custom durations.
- Generator actions can add image, video, and voice reference nodes, with Seedance and Gemini Omni accepting multimodal references.
- Image nodes add mask painting, crop, upscale, detail preview, and toolbar customization; the workspace panel lists only canvas nodes and shares one combined toolbar for editing and zoom controls.

### [Fixed]

- Signup now starts a session after account creation and explains how to continue if automatic sign-in fails.
- Mobile page shells now stack navigation above page content instead of reserving a desktop sidebar column.
- The Docs route uses the shared navigation and is reachable from the workspace sidebar.
- Payload uploads persist in the Docker volume across app restarts and resolve previews through the local media route.
- The selected image provider remains selected when its default model changes.
- Video input nodes preserve the uploaded video's actual aspect ratio.
- M4A uploads are normalized before media signature validation.

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
