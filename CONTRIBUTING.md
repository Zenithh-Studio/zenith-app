# Contributing

Thanks for helping improve Znith Studio. Keep changes focused, preserve the Figma Make integration contracts, and include tests for behavior changes.

## Development setup

1. Install Node.js `24.22.1` and pnpm `10.x`.
2. Run `pnpm install` from the repository root.
3. Use the Figma Make host for Payload-backed development. The platform provides the Payload backend configuration and secrets.

## Workspace conventions

- Put browser-facing features and presentation in `fe/`.
- Put use cases, domain ports, Payload adapters, and provider execution in `be/`.
- Put cross-workspace DTOs, schemas, registry data, and templates in `packages/contracts/`.
- Put pure, reusable helpers in `packages/utils/`.
- Keep Next.js route files thin and preserve generated Payload files under `src/app/(payload)/`.
- Keep Payload access checks enabled in user-facing Local API calls. Do not introduce a database adapter, placeholder secrets, or hand-written migrations for the Make-managed backend.

## Checks

Run the checks that match your change before opening a pull request:

```bash
pnpm format:check
pnpm typecheck
pnpm test
```

Add or update unit tests for domain, use-case, validation, and utility behavior. Production route verification that depends on the Figma Make backend must run in the Make environment.

## Commit messages

Use Conventional Commits with a module scope when practical:

```text
feat(be/workflows): add workflow retry policy
fix(fe/editor): preserve selected node after save
docs(repo): describe workspace boundaries
```

Husky checks formatting, types, tests, and the commit message before recording a commit.

## Changesets

Add a changeset for package behavior or documentation changes that should appear in release notes:

```bash
pnpm changeset
```

Choose `patch` for compatible fixes, `minor` for backward-compatible features, and `major` for breaking contract changes. Write concise release notes with a category prefix such as `Added:`, `Changed:`, or `Fixed:`. The release workflow generates package versions and changelogs from committed changesets.

## Pull requests

Describe the user impact, implementation boundary, and test evidence. Call out any Payload schema or access-control change explicitly. Do not include credentials or private customer data.
