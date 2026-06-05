# Research: Remove Azure Entra ID / Graph API Code

**Branch**: `001-remove-entra-graph` | **Date**: 2026-06-04

---

## Decision 1: OboTokenService.js — Keep or Delete?

**Decision**: Keep `OboTokenService.js`.

**Rationale**: `OboTokenService.js` is a generic OAuth 2.0 On-Behalf-Of (jwt-bearer grant) service. It is used by two independent consumers:
1. `GraphTokenService.js` — Azure-specific wrapper (to be deleted)
2. `api/server/services/MCP.js` — MCP server OBO token resolution (`oboTokenResolver`) used when MCP servers are configured with OBO auth (permission: `CONFIGURE_OBO`)

The MCP OBO feature is Keycloak-compatible (standard RFC 8693 Token Exchange). Deleting `OboTokenService.js` would break MCP OBO server configuration, which is out of scope for this removal.

**Files affected**: `GraphTokenService.js` is deleted; `OboTokenService.js` is untouched.

---

## Decision 2: GraphTokenService.js — Full delete confirmed

**Decision**: Delete `GraphTokenService.js` (28 lines).

**Rationale**: Thin wrapper around `OboTokenService.exchangeOboToken` adding only Graph-specific error context. Used by:
- `MCP.js:742` — `graphTokenResolver: getGraphApiToken` (remove this parameter)
- `AuthController.js:26` — import + `graphTokenController` endpoint (remove entirely)
- `api/server/routes/auth.js:95` — `GET /api/auth/graph-token` route (remove)

After deletion, callers that needed Graph tokens via MCP should use the `GRAPH_TOKEN_PLACEHOLDER` mechanism — which is itself Azure-specific and also removed (`packages/api/src/utils/graph.ts`).

---

## Decision 3: packages/api/src/utils/graph.ts — Full delete confirmed

**Decision**: Delete `packages/api/src/utils/graph.ts` (213 lines).

**Rationale**: Entirely Azure/Microsoft Graph specific. Exports:
- `GraphTokenResolver` type
- `containsGraphTokenPlaceholder`, `recordContainsGraphTokenPlaceholder`, `mcpOptionsContainGraphTokenPlaceholder`
- `resolveGraphTokenPlaceholder`, `resolveGraphTokensInRecord`, `preProcessGraphTokens`

These enable MCP servers to embed a `{{GRAPH_TOKEN}}` placeholder in headers/env/url that is resolved to an Azure AD token at runtime. No Keycloak equivalent.

Consumers: `packages/api/src/mcp/MCPManager.ts` (optional `graphTokenResolver` parameter, Graph placeholder resolution). All Graph placeholder handling in MCPManager is removed.

---

## Decision 4: idOnTheSource — Full removal from User; simplified removal from Group

**Decision**: Remove `idOnTheSource` from `IUser` and the Mongoose user schema. On the Group schema, remove `idOnTheSource`, `source: 'entra'`, and all Entra-specific group methods.

**Rationale**: 118 non-test references across 20 source files. The field serves two purposes:
1. On `IUser`: stores the Entra Object ID (oid claim) — remove entirely
2. On `IGroup`: stores external group ID for Entra groups; `memberIds` array stores `idOnTheSource` values of members

With no Entra deployment, no group will ever have `source: 'entra'`. The group membership lookup in `userGroup.ts` has a fallback: `user.idOnTheSource || userId.toString()`. When `idOnTheSource` is absent (which it always will be without Entra), it uses `userId.toString()`. The fallback is already the production path.

**Impact summary**:
- `packages/data-schemas/src/schema/user.ts` — remove `idOnTheSource` field
- `packages/data-schemas/src/types/user.ts` — remove `idOnTheSource` from `IUser`, `UserFilterOptions`
- `packages/data-schemas/src/schema/group.ts` — remove `idOnTheSource` field, change `source` enum to `['local']` only, remove partial index on `idOnTheSource`
- `packages/data-schemas/src/types/group.ts` — remove `idOnTheSource`, simplify `source` type
- `packages/data-schemas/src/methods/userGroup.ts` — remove `findGroupByExternalId`, `findGroupsByExternalIds`, `upsertGroupByExternalId`; simplify `getUserGroups` to drop the `idOnTheSource` lookup path
- All downstream callers of removed methods: already only called from Entra-specific code being removed

---

## Decision 5: PermissionsController.js — Entra search removal

**Decision**: Remove Entra ID people search (`searchEntraIdPrincipals`) from `PermissionsController.js`.

**Rationale**: `PermissionsController` imports `entraIdPrincipalFeatureEnabled` and `searchEntraIdPrincipals` from `GraphApiService`. The people search endpoint has a hybrid path: local DB search + optional Entra search when `USE_ENTRA_ID_FOR_PEOPLE_SEARCH=true`. With Entra removed, only the local DB path remains. The endpoint stays; the Entra branch is deleted.

---

## Decision 6: `GRAPH_API_SCOPES`, `GRAPH_API_URL`, related env vars

**Decision**: Remove from `.env.example` alongside the Entra ID section.

**Rationale**: Only consumed by `graph.ts` (deleted) and `GraphApiService.js` (deleted). No other consumers.

---

## Actual File Inventory (corrections to spec)

### Delete entirely
| File | Lines | Reason |
|---|---|---|
| `api/server/services/GraphApiService.js` | 652 | Azure Entra/Graph API calls |
| `api/server/services/GraphTokenService.js` | 28 | Azure Graph OBO wrapper |
| `packages/api/src/utils/graph.ts` | 213 | Graph token placeholder resolution |

### Modify (Entra blocks removed)
| File | What changes |
|---|---|
| `api/strategies/openidStrategy.js` | Remove `exchangeTokenForOverage`, `resolveGroupsFromOverage`, all Azure AD group overage call sites |
| `api/strategies/openIdJwtStrategy.js` | Remove `idOnTheSource: payload?.oid` assignment |
| `api/server/services/PermissionService.js` | Remove `syncUserEntraGroupMemberships`, Entra branch in `ensureGroupPrincipalExists`, GraphApiService import |
| `api/server/controllers/AuthController.js` | Remove `getGraphApiToken` import, `graphTokenController`, export |
| `api/server/controllers/PermissionsController.js` | Remove `entraIdPrincipalFeatureEnabled`, `searchEntraIdPrincipals` import/usage |
| `api/server/services/MCP.js` | Remove `getGraphApiToken` import, `graphTokenResolver` parameter |
| `api/server/routes/auth.js` | Remove `graphTokenController` import, `GET /graph-token` route |
| `packages/api/src/mcp/MCPManager.ts` | Remove `graphTokenResolver` optional field, Graph placeholder resolution calls |
| `packages/data-schemas/src/schema/user.ts` | Remove `idOnTheSource` field |
| `packages/data-schemas/src/types/user.ts` | Remove `idOnTheSource` from `IUser`, `UserFilterOptions` |
| `packages/data-schemas/src/schema/group.ts` | Remove `idOnTheSource`, simplify `source` enum, remove partial index |
| `packages/data-schemas/src/types/group.ts` | Remove `idOnTheSource`, simplify `source` |
| `packages/data-schemas/src/methods/userGroup.ts` | Remove Entra-specific methods, simplify `getUserGroups` |
| `packages/api/src/admin/groups.ts` | Remove `idOnTheSource` references |
| `packages/api/src/auth/openid.ts` | Remove `idOnTheSource` / Entra oid assignment |
| `packages/api/src/apiKeys/permissions.ts` | Remove `idOnTheSource` references |
| `packages/api/src/auth/codeapi.ts` | Remove `idOnTheSource` references |
| `packages/api/src/middleware/remoteAgentAuth.ts` | Remove `idOnTheSource` references |
| `packages/data-provider/src/accessPermissions.ts` | Remove `idOnTheSource` references |
| `client/src/hooks/Sharing/useResourcePermissionState.ts` | Remove `idOnTheSource` references |
| `.env.example` | Remove Entra ID / Graph API section |

### Delete tests
| File | Reason |
|---|---|
| `packages/data-schemas/src/methods/userGroup.spec.ts` | Tests Entra-specific `idOnTheSource` group membership paths |
| Any test file importing `GraphApiService`, `GraphTokenService`, `graph.ts` | Dead imports |
