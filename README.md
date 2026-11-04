# Znith AI Workflow Studio

Znith Studio is a visual workspace for authoring, validating, and running AI workflows. It combines a ReactFlow editor with a Payload-backed content layer and server-side provider adapters.

## Monorepo

The repository is a pnpm workspace. The root Next.js application is the Figma Make deployment adapter; its App Router files stay at the root so Payload Admin, the generated Payload routes, and the Make lifecycle continue to use their supported layout.

| Workspace               | Responsibility                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `fe/`                   | Frontend presentation, route components, and browser interactions                                  |
| `be/`                   | Workflow and asset use cases, Payload repositories, provider execution, and collection definitions |
| `packages/contracts/`   | Shared workflow types, Zod request contracts, node registry, provider catalog, and templates       |
| `packages/utils/`       | Reusable, framework-independent helpers                                                            |
| `src/app/`              | Thin Next.js route adapters and the generated Payload Admin/API routes                             |
| `src/payload.config.ts` | Figma Payload composition root and automatic type-generation target                                |

The frontend and backend packages use clean boundaries: App Router handlers translate HTTP requests, application services coordinate use cases, repository ports define persistence needs, and Payload adapters implement those ports. Shared contracts stay independent of React and Payload.

## Requirements

- Node.js `24.22.1`
- pnpm `10.x`
- A Figma Make runtime for Payload-backed local development and production builds

## Development

Figma Make manages the development server on `$PORT`.

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm format:check
```

To start the app outside the Make host, run `pnpm dev`. Payload/Figma platform configuration is injected by the Make lifecycle; do not add local database adapters or placeholder secrets.

## Product capabilities

- Create, search, duplicate, import, export, and delete workflows.
- Compose graphs with typed inputs and outputs, undo/redo, copy/paste, and layout controls.
- Validate acyclic dependencies and execute ready nodes concurrently with retry and timeout policies.
- Persist execution snapshots, node outputs, status, logs, and errors in Payload.
- Upload and reuse media from the Payload Media collection.
- Configure server-side provider credentials through Make settings → Secrets.

## Provider configuration

Provider credentials are read only in backend code. For example, the OpenAI text adapter reads `APP_OPENAI_API_KEY`. Set provider secrets in the platform environment-variable flow; never commit them or place them in workflow definitions.

Image and video generation requires a compatible provider and model configuration. Output nodes currently preserve the provider's output reference and filename metadata; persistent media ingestion is a separate storage capability.

## Quality and releases

`pnpm verify` runs formatting checks, TypeScript checks, and unit tests. GitHub Actions runs the same checks on pushes and pull requests. Production Payload builds and `figma make verify-deploy` remain Make-host checks because they need platform-provisioned backend configuration.

Use `pnpm changeset` for user-visible changes. Changeset entries select `patch`, `minor`, or `major` and use release notes beginning with labels such as `Added:`, `Changed:`, or `Fixed:`. The release workflow updates package versions and changelogs in a release pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [docs/architecture.md](docs/architecture.md).

For the product, data, device, and cleanup assessment, see [docs/project-assessment.md](docs/project-assessment.md).
