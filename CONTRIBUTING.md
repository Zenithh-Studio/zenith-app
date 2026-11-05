# Contributing

Thanks for helping improve Znith Studio. Keep changes focused and include tests for behavior changes.

## Development setup

1. Install Node.js `24.22.1` and pnpm `10.x`.
2. Run `pnpm install` from the repository root.
3. Start the app and PostgreSQL with `docker compose up -d --build`, or provide a local PostgreSQL database plus `DATABASE_URL` and `PAYLOAD_SECRET` for `pnpm dev`.

## Workspace conventions

- Put browser-facing features and presentation in `apps/studio/src/features/`.
- Put use cases, domain ports, Payload adapters, and provider execution in `apps/studio/src/server/`.
- Put cross-workspace DTOs, schemas, registry data, and templates in `packages/contracts/`.
- Put pure, reusable helpers in `packages/utils/`.
- Keep Next.js route files thin and preserve generated Payload files under `apps/studio/src/app/(payload)/`. Regenerate the import map through the Payload CLI rather than editing it directly.
- Keep Payload access checks enabled in user-facing Local API calls. Use the PostgreSQL adapter and committed migrations for persistence.

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

Describe the user impact, implementation boundary, and test evidence. Call out any Payload schema or access-control change explicitly. Do not include credentials or private customer data.
