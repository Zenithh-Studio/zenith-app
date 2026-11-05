# @znith/contracts

## 0.2.1

### Patch Changes

- ccc1538: Changed: Removed the duplicated root source paths after moving their modules into the frontend, backend, and contracts workspaces.

## 0.2.0

### Minor Changes

- 6628694: Added: Introduced workflow and asset application services with repository ports, Payload adapters, and focused unit tests.

  Fixed: Return a structured service-unavailable response when platform backend configuration is not available.

- 6d24955: Added: Split the studio into reusable frontend, backend, contracts, and utility workspaces.

  Changed: Route handlers now delegate workflow and asset operations to backend application services.

- 98dc262: Added: Established reusable frontend, backend, contracts, and utility workspaces.

  Changed: Kept the Next.js deployment shell at the root and moved application modules behind explicit package boundaries.

### Patch Changes

- 6d24955: Added: Added cross-platform pnpm scripts, Husky commit checks, Changesets release automation, CI workflows, and contributor/security guidance.
