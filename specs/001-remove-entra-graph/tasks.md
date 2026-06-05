# Tasks: Remove Azure Entra ID / Graph API Code

**Input**: Design documents from `specs/001-remove-entra-graph/`

**Branch**: `001-remove-entra-graph`

**Organization**: Tasks grouped by user story for independent implementation and testing.
No TDD requested — no test tasks in story phases (only cleanup of existing Entra tests in Polish phase).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: Which user story this task belongs to
- Exact file paths included in all descriptions

---

## Phase 1: Setup

No project scaffolding needed — this is a removal task on an existing codebase.

---

## Phase 2: Foundational — Delete Service Files

**Purpose**: Remove the three Azure-specific service files. All subsequent tasks depend on these being gone to avoid broken imports.

**⚠️ CRITICAL**: No user story work can begin until these three files are deleted.

- [x] T001 Delete `api/server/services/GraphApiService.js` (652 lines — Entra/Graph API calls)
- [x] T002 Delete `api/server/services/GraphTokenService.js` (28 lines — Azure Graph OBO wrapper)
- [x] T003 Delete `packages/api/src/utils/graph.ts` (213 lines — Graph token placeholder resolution)

**Checkpoint**: Three files deleted. Running `git status` should show 3 deletions. Any attempt to `require`/`import` these will now fail — fix all consumers in Phase 3.

---

## Phase 3: User Story 1 — Dead Import Cleanup (Priority: P1) 🎯 MVP

**Goal**: Remove all imports and usages of the three deleted files from every consumer in `api/` and `packages/api/`. After this phase, `grep -r "GraphApiService\|GraphTokenService\|utils/graph"` returns zero results.

**Independent Test**: `grep -r "GraphApiService\|GraphTokenService\|utils/graph" api/ packages/ --include="*.js" --include="*.ts" --exclude-dir=node_modules` — zero results. Backend starts without import errors.

### Implementation

- [x] T004 [US1] Remove `getGraphApiToken` import (line 36) and `graphTokenResolver: getGraphApiToken` parameter (line 742) from `api/server/services/MCP.js`
- [x] T005 [P] [US1] Remove `getGraphApiToken` import (line 26), delete `graphTokenController` function (lines 294–339), and remove it from `module.exports` (line 340) in `api/server/controllers/AuthController.js`
- [x] T006 [P] [US1] Remove `graphTokenController` import (line 7) and `GET /api/auth/graph-token` route (line 95) from `api/server/routes/auth.js`
- [x] T007 [P] [US1] Remove `GraphTokenResolver` type import and all `graphTokenResolver` field/parameter usages from `packages/api/src/mcp/MCPManager.ts` (optional field at line 314, usage at line 383; also remove Graph placeholder pre-processing calls that used `preProcessGraphTokens` from `graph.ts`)
- [x] T008 [P] [US1] Remove Azure AD group overage functions `exchangeTokenForOverage` (~lines 326–370) and `resolveGroupsFromOverage` (~lines 384–430) from `api/strategies/openidStrategy.js`, and remove all call sites (~lines 480–560 in `processOpenIDAuth`)
- [x] T009 [P] [US1] Remove `idOnTheSource: payload?.oid` assignment (line 108) from `api/strategies/openIdJwtStrategy.js`

**Checkpoint**: Phase 3 complete — `grep` for deleted file names returns zero. Backend can be started and will not throw on import. `AuthController` no longer exports `graphTokenController`. `/api/auth/graph-token` route is gone.

---

## Phase 4: User Story 2 — PermissionService Functional Without Entra (Priority: P2)

**Goal**: Remove Entra-specific code from `PermissionService.js` and `PermissionsController.js`. The service remains fully functional for local/OIDC principals. `syncUserEntraGroupMemberships` is removed. The people-search endpoint keeps its local DB path.

**Independent Test**: `node -e "const ps = require('./api/server/services/PermissionService'); console.log(Object.keys(ps).join(', '))"` — output includes all 12 existing exports and does NOT include `syncUserEntraGroupMemberships`. `PermissionsController.js` imports no `GraphApiService` symbols.

### Implementation

- [x] T010 [US2] Remove from `api/server/services/PermissionService.js`:
  - `entraIdPrincipalFeatureEnabled`, `getUserOwnedEntraGroups`, `getUserEntraGroups`, `getEntraGroupDetailsBatch`, `getGroupMembers`, `getGroupOwners` import from `GraphApiService` (lines 7–12)
  - `syncUserEntraGroupMemberships` function (lines 483–620)
  - Entra `source === 'entra'` branch inside `ensureGroupPrincipalExists` (lines 369–461)
  - Remove `syncUserEntraGroupMemberships` from `module.exports` (line 919)
- [x] T011 [P] [US2] Remove from `api/server/controllers/PermissionsController.js`:
  - `entraIdPrincipalFeatureEnabled` and `searchEntraIdPrincipals` import from `GraphApiService` (lines 19–21)
  - `useEntraId` variable and Entra search branch in the people-search handler (~lines 80–90, 418–466)
  - `idOnTheSource` field on result objects returned to the client (~lines 261–274, 451) — replace with local `_id.toString()` only
- [x] T012 [P] [US2] Remove `idOnTheSource` references from `packages/api/src/admin/groups.ts`
- [x] T013 [P] [US2] Remove `idOnTheSource` references from `packages/api/src/apiKeys/permissions.ts`
- [x] T014 [P] [US2] Remove `idOnTheSource` / Entra `oid` claim assignment from `packages/api/src/auth/openid.ts`
- [x] T015 [P] [US2] Remove `idOnTheSource` references from `packages/api/src/auth/codeapi.ts`
- [x] T016 [P] [US2] Remove `idOnTheSource` references from `packages/api/src/middleware/remoteAgentAuth.ts`

**Checkpoint**: `PermissionService` exports 12 functions (no `syncUserEntraGroupMemberships`). `PermissionsController` people-search returns local results only. No `GraphApiService` imports remain in either file.

---

## Phase 5: User Story 3 — Schema Cleanup (Priority: P3)

**Goal**: Remove `idOnTheSource` from all schema definitions, types, methods, data-provider types, and frontend hooks. Simplify group `source` enum to `['local']` only. No database migration needed (no existing data).

**Independent Test**: `grep -r "idOnTheSource" api/ packages/ client/ --include="*.js" --include="*.ts" --exclude-dir=node_modules --exclude="*.spec.*" --exclude="*.test.*"` returns zero results. TypeScript compiles clean across all workspaces.

### Implementation

- [x] T017 [US3] Remove `idOnTheSource` field definition from `packages/data-schemas/src/schema/user.ts`
- [x] T018 [P] [US3] Remove `idOnTheSource` from `IUser` interface and from `UserFilterOptions` in `packages/data-schemas/src/types/user.ts`
- [x] T019 [P] [US3] Remove `idOnTheSource` field, change `source` enum from `['local', 'entra']` to `['local']`, and remove the partial index on `idOnTheSource` from `packages/data-schemas/src/schema/group.ts`
- [x] T020 [P] [US3] Remove `idOnTheSource` field and simplify `source` type from `'local' | 'entra'` to `'local'` in `packages/data-schemas/src/types/group.ts`
- [x] T021 [US3] Remove Entra-specific methods `findGroupByExternalId`, `findGroupsByExternalIds`, `upsertGroupByExternalId` from `packages/data-schemas/src/methods/userGroup.ts`; simplify `getUserGroups` to remove the `user.idOnTheSource` lookup path (always use `userId.toString()`)
- [x] T022 [P] [US3] Remove `idOnTheSource` references from `packages/data-provider/src/accessPermissions.ts`
- [x] T023 [P] [US3] Remove `idOnTheSource` references from `client/src/hooks/Sharing/useResourcePermissionState.ts`
- [x] T024 [P] [US3] Remove the entire "Microsoft Graph API / Entra ID Integration" section from `.env.example`, including `USE_ENTRA_ID_FOR_PEOPLE_SEARCH`, `ENTRA_ID_INCLUDE_OWNERS_AS_MEMBERS`, `GRAPH_API_SCOPES`, and all associated comments

**Checkpoint**: TypeScript compiles with `npx tsc --noEmit` in `packages/data-schemas`, `packages/api`, and `packages/data-provider` with zero errors. `idOnTheSource` grep returns zero non-test results.

---

## Phase 6: Polish & Test Cleanup

**Purpose**: Remove Entra-specific test cases, run the full suite, and confirm the quickstart checklist passes.

- [x] T025 [P] Remove Entra-specific test cases from `packages/data-schemas/src/methods/userGroup.spec.ts` — delete test blocks that use `idOnTheSource`, `source: 'entra'`, `findGroupByExternalId`, `upsertGroupByExternalId`; keep local group membership tests
- [x] T026 [P] Scan all spec/test files for imports of `GraphApiService`, `GraphTokenService`, or `utils/graph` and remove those test files or the offending test cases: `grep -r "GraphApiService\|GraphTokenService\|utils/graph" --include="*.spec.*" --include="*.test.*" -l`
- [x] T027 Run `cd api && npx jest` — confirm zero new failures
- [x] T028 [P] Run `cd packages/data-schemas && npx jest` — confirm zero new failures
- [x] T029 [P] Run `cd packages/api && npx jest` — confirm zero new failures
- [x] T030 Run full quickstart.md validation checklist (all 8 steps)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately
- **US1 (Phase 3)**: Depends on Phase 2 (files must be deleted before fixing imports)
- **US2 (Phase 4)**: Depends on Phase 2 (`GraphApiService` must be gone before removing its imports in `PermissionService`)
- **US3 (Phase 5)**: Independent of US1 and US2 — can start after Phase 2
- **Polish (Phase 6)**: Depends on US1 + US2 + US3 all complete

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only
- **US2 (P2)**: Depends on Foundational only; can proceed in parallel with US1 (different files)
- **US3 (P3)**: Depends on Foundational only; can proceed in parallel with US1 + US2 (different files/workspaces)

### Within Each Story

- T005 and T006 are parallel (different files, both remove `graphTokenController`)
- T010 (PermissionService) must precede nothing — standalone
- T017–T024 in Phase 5 are mostly parallel (different files in different packages)
- T025–T026 are parallel (different test files); T027–T029 are parallel (different workspaces)

---

## Parallel Execution Examples

### After Phase 2 (all three files deleted):

```
Parallel batch 1 — can all start at once:
  T004  MCP.js graphTokenResolver removal
  T005  AuthController graphTokenController removal
  T006  auth.js /graph-token route removal
  T007  MCPManager.ts graphTokenResolver removal
  T008  openidStrategy.js overage block removal
  T009  openIdJwtStrategy.js idOnTheSource removal
  T010  PermissionService Entra removal
  T011  PermissionsController Entra removal
  T017  user schema idOnTheSource removal
```

### Schema cleanup (Phase 5) — all parallel after T017:

```
  T018  IUser types
  T019  group schema
  T020  group types
  T021  userGroup methods  ← sequential after T019/T020 (types must exist)
  T022  accessPermissions
  T023  useResourcePermissionState
  T024  .env.example
```

---

## Implementation Strategy

### MVP (User Story 1 — Phase 2 + Phase 3)

1. Complete Phase 2: delete 3 files
2. Complete Phase 3: fix all broken imports in `api/` and `packages/api/`
3. **Validate**: backend starts, no import errors, `grep` returns zero
4. Merge or continue

### Full Removal (All Stories)

1. Phase 2 → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6 (Polish)
2. Each phase checkpoint confirms no regressions before proceeding

### Parallel Team Strategy

With two developers after Phase 2:
- Developer A: Phase 3 (US1 — api/ import cleanup)
- Developer B: Phase 5 (US3 — schema cleanup, different workspaces)
- Phase 4 (US2 — PermissionService) can be taken by whoever finishes first

---

## Notes

- `OboTokenService.js` is NOT deleted — it is a generic OBO service used by MCP server configuration
- `api/cache/getLogStores.js`, `api/server/middleware/noIndex.js`, `api/server/services/Endpoints/agents/skillDeps.js`, `api/server/controllers/agents/callbacks.js`, `api/server/controllers/agents/request.js` contain NO Entra references — confirmed by grep; no changes needed
- `LangGraph` references in `callbacks.js`/`request.js` are unrelated to Azure Graph API
- All `[P]` tasks operate on different files and have no shared state dependencies
