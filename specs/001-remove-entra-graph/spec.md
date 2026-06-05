# Feature Specification: Remove Azure Entra ID / Graph API Code

**Feature Branch**: `001-remove-entra-graph`

**Created**: 2026-06-04

**Status**: Draft

**Input**: Step 1 of Keycloak migration — remove all Azure Entra ID and Microsoft Graph API integration code from LibreChat. The feature is currently optional (disabled by default via `USE_ENTRA_ID_FOR_PEOPLE_SEARCH=false`) and will not be part of the Keycloak-based deployment.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Developer removes dead Entra ID code (Priority: P1)

A developer working on the Keycloak migration needs a clean codebase with no Azure Entra ID or Microsoft Graph API code. All three service files are deleted, all referencing code is cleaned up, and the environment variable documentation no longer mentions these features.

**Why this priority**: Unblocks the rest of the Keycloak migration by eliminating code paths that would break (Graph API calls with a Keycloak token) and reducing cognitive load.

**Independent Test**: Run `grep -r "GraphApi\|OboToken\|GraphToken\|ENTRA\|entraId\|idOnTheSource\|USE_ENTRA_ID" api/ packages/ client/ .env.example` — zero results expected.

**Acceptance Scenarios**:

1. **Given** the codebase on branch `001-remove-entra-graph`, **When** a developer runs the backend test suite, **Then** all tests pass with no import errors or missing-module failures.
2. **Given** the cleaned codebase, **When** a developer searches for `GraphApiService`, `OboTokenService`, or `GraphTokenService`, **Then** no source files reference these modules.
3. **Given** the cleaned `.env.example`, **When** a developer reviews environment variable documentation, **Then** no `USE_ENTRA_ID_FOR_PEOPLE_SEARCH` or `ENTRA_ID_INCLUDE_OWNERS_AS_MEMBERS` variables appear.

---

### User Story 2 — PermissionService works without Entra (Priority: P2)

The `PermissionService` continues to handle local and OIDC-sourced principals (USER, GROUP, ROLE, PUBLIC) after the Entra-specific code is removed. Resource-level ACL for agents, prompts, and other resources remains fully functional.

**Why this priority**: ACL is load-bearing for the existing product; it must not regress.

**Independent Test**: Run `PermissionService` unit tests — `grantPermission`, `checkPermission`, `getEffectivePermissions`, `bulkUpdateResourcePermissions` all pass. The `syncUserEntraGroupMemberships` export is gone.

**Acceptance Scenarios**:

1. **Given** a user with a local group membership, **When** `checkPermission` is called for a resource shared with that group, **Then** access is granted correctly.
2. **Given** the updated `PermissionService`, **When** the module is imported, **Then** no `GraphApiService` import is resolved and no `entraIdPrincipalFeatureEnabled` reference exists.

---

### User Story 3 — User schema cleaned up (Priority: P3)

The `IUser` TypeScript interface and underlying Mongoose schema no longer contain the `idOnTheSource` field, which was exclusively used for Entra ID object IDs.

**Why this priority**: Schema cleanliness reduces confusion for future contributors; removing unused fields prevents accidental use in new code.

**Independent Test**: TypeScript compilation succeeds with no errors. `grep -r "idOnTheSource" packages/data-schemas/ packages/data-provider/ api/` returns zero results.

**Acceptance Scenarios**:

1. **Given** the updated `IUser` interface, **When** the TypeScript compiler runs, **Then** it produces no errors related to missing or undefined `idOnTheSource` references.
2. **Given** any code that previously set `idOnTheSource`, **When** those references are removed or updated, **Then** all related logic is either deleted or replaced with the appropriate Keycloak-compatible identifier.

---

### Edge Cases

- `ensureGroupPrincipalExists` in `PermissionService` handles both `entra` and `local` source groups — after removal, only `local` source is supported; passing `source: 'entra'` should throw a clear error or be unreachable.
- `openidStrategy.js` contains Azure AD group overage handling (>200 groups via Graph API OBO) — this entire block is removed; the standard OIDC groups claim is used instead.
- Environment variables `USE_ENTRA_ID_FOR_PEOPLE_SEARCH` and `ENTRA_ID_INCLUDE_OWNERS_AS_MEMBERS` must be removed from `.env.example` and any documentation; no fallback or deprecation warning is needed.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The three service files (`GraphApiService.js`, `GraphTokenService.js`, `OboTokenService.js`) MUST be deleted from the repository.
- **FR-002**: All imports of `GraphApiService`, `GraphTokenService`, and `OboTokenService` MUST be removed from every consuming file.
- **FR-003**: `PermissionService.js` MUST have `syncUserEntraGroupMemberships` removed and the `entra` source branch in `ensureGroupPrincipalExists` removed; it MUST continue to export all remaining functions unchanged.
- **FR-004**: `openidStrategy.js` MUST have the Azure AD group overage block (`resolveGroupsFromOverage`, `exchangeTokenForOverage`, and all call sites) removed; standard OIDC group claim processing MUST remain intact.
- **FR-005**: `openIdJwtStrategy.js` MUST have all Entra/OBO-specific references removed.
- **FR-006**: `AuthController.js` MUST have all `OboTokenService` usage removed.
- **FR-007**: `PermissionsController.js` MUST have all `idOnTheSource` and Entra-specific references removed.
- **FR-008**: All other referencing files (`agents/callbacks.js`, `agents/request.js`, `mcp.js`, `MCP.js`, `skillDeps.js`, `noIndex.js`, `getLogStores.js`) MUST have Entra/Graph references removed.
- **FR-009**: `packages/data-schemas/src/types/user.ts` MUST have the `idOnTheSource` field removed from `IUser` and `UserFilterOptions`.
- **FR-010**: `.env.example` MUST have the entire "Microsoft Graph API / Entra ID Integration" section removed, including `USE_ENTRA_ID_FOR_PEOPLE_SEARCH` and `ENTRA_ID_INCLUDE_OWNERS_AS_MEMBERS`.
- **FR-011**: No dead code, commented-out blocks, or `// TODO: remove` markers MUST remain after cleanup.
- **FR-012**: All existing tests MUST pass after removal (no new test failures introduced).

### Key Entities

- **GraphApiService**: Service providing Microsoft Graph API calls for user/group enumeration — deleted entirely.
- **OboTokenService**: On-Behalf-Of token exchange service for Azure AD — deleted entirely.
- **GraphTokenService**: Token acquisition helper for Graph API — deleted entirely.
- **syncUserEntraGroupMemberships**: Function in `PermissionService` that synced Entra group memberships at login — removed.
- **idOnTheSource**: Field on `IUser` storing the Entra object ID — removed from schema and all usages.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero source files in `api/`, `packages/`, or `client/` reference `GraphApiService`, `OboTokenService`, `GraphTokenService`, `entraIdPrincipalFeatureEnabled`, `idOnTheSource`, `USE_ENTRA_ID_FOR_PEOPLE_SEARCH`, or `ENTRA_ID_INCLUDE_OWNERS_AS_MEMBERS` after the change.
- **SC-002**: The full backend test suite passes with no new failures introduced by this removal.
- **SC-003**: TypeScript compilation of `packages/data-schemas` and `packages/api` produces zero errors after schema changes.
- **SC-004**: The three deleted service files account for approximately 874 lines removed; net line count reduction is measurable via `git diff --stat`.
- **SC-005**: `PermissionService` exports (`grantPermission`, `checkPermission`, `getEffectivePermissions`, `getResourcePermissionsMap`, `findAccessibleResources`, `findPubliclyAccessibleResources`, `hasPublicPermission`, `getAvailableRoles`, `bulkUpdateResourcePermissions`, `ensurePrincipalExists`, `ensureGroupPrincipalExists`, `removeAllPermissions`) remain intact and functional.

---

## Assumptions

- No production deployment currently uses `USE_ENTRA_ID_FOR_PEOPLE_SEARCH=true`; removal is safe with no migration or deprecation notice required.
- No existing users have `idOnTheSource` populated; the schema field can be dropped without a database migration script.
- The OIDC standard groups claim (included in the JWT by Keycloak) is sufficient for all group-based ACL needs in this deployment; the 200-group overage workaround is not needed.
- `ensureGroupPrincipalExists` will still be needed for local groups; only the `entra` source branch is removed. The function signature and non-entra behaviour are preserved.
- Tests referencing `idOnTheSource` or Entra-specific behaviour should be deleted alongside the removed code (not updated to pass with empty stubs).
