# Contributing

Thanks for helping improve Znith Studio. Keep changes focused and include tests for behavior changes.

## Development setup

1. Install Node.js `24.22.1` and pnpm `10.x`.
2. Run `pnpm install` from the repository root.
3. Start the app and provider gateways with `docker compose up -d --build`, or run `pnpm dev` without Docker. Studio records persist in the browser's IndexedDB.

## Workspace conventions

- Put browser-facing features and presentation in `apps/studio/src/features/`.
- Put request validation and provider execution in `apps/studio/src/server/`.
- Put cross-workspace DTOs, schemas, registry data, and templates in `packages/contracts/`.
- Put pure, reusable helpers in `packages/utils/`.
- Keep Next.js route files thin and validate provider-compute request bodies.
- Keep durable Studio records in the browser's IndexedDB through `studio-indexed-db.ts`; server routes return results and do not persist user data.
- Files under `apps/studio/src/migrations/` are historical PostgreSQL migration records and are not used by the current app.

## Checks

Run the checks that match your change before opening a pull request:

```bash
pnpm format
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

Add or update unit tests for domain, use-case, validation, and utility behavior. Verify container changes with `docker compose up -d --build` and `docker compose ps`.

## Commit messages

Use Conventional Commits with a module scope when practical:

```text
feat(studio/workflows): add workflow retry policy
fix(studio/editor): preserve selected node after save
docs(repo): describe workspace boundaries
```

Husky checks formatting, types, tests, and the commit message before recording a commit.

## Release notes

Use Conventional Commits with a module scope for user-visible changes. Release Please reads commits merged to `main`, opens a release pull request, and updates the single project-wide `CHANGELOG.md`. Keep release history in that root file; do not add package-specific changelogs.

## Pull requests

Describe the user impact, implementation boundary, and test evidence. Do not include credentials or private customer data.
