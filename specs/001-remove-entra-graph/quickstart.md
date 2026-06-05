# Quickstart: Validate Entra ID / Graph API Removal

**Branch**: `001-remove-entra-graph` | **Date**: 2026-06-04

---

## Prerequisites

- Node.js 24 installed
- MongoDB running (or `mongodb-memory-server` for tests)
- On branch `001-remove-entra-graph`

---

## Step 1 — Verify deleted files are gone

```bash
# All three should return "No such file"
ls api/server/services/GraphApiService.js 2>&1
ls api/server/services/GraphTokenService.js 2>&1
ls packages/api/src/utils/graph.ts 2>&1
```

Expected: `No such file or directory` for each.

---

## Step 2 — Verify no dead imports remain

```bash
grep -r "GraphApiService\|GraphTokenService\|utils/graph" api/ packages/ client/ \
  --include="*.js" --include="*.ts" \
  --exclude-dir=node_modules --exclude-dir=dist
```

Expected: zero results.

---

## Step 3 — Verify env vars removed from .env.example

```bash
grep "USE_ENTRA_ID_FOR_PEOPLE_SEARCH\|ENTRA_ID_INCLUDE_OWNERS_AS_MEMBERS\|GRAPH_API_SCOPES" .env.example
```

Expected: zero results.

---

## Step 4 — Verify idOnTheSource removed from source

```bash
grep -r "idOnTheSource" api/ packages/ client/ \
  --include="*.js" --include="*.ts" \
  --exclude-dir=node_modules --exclude-dir=dist \
  --exclude="*.spec.*" --exclude="*.test.*"
```

Expected: zero results.

---

## Step 5 — TypeScript compilation

```bash
# packages/data-schemas
cd packages/data-schemas && npx tsc --noEmit
# packages/api
cd packages/api && npx tsc --noEmit
# packages/data-provider
cd packages/data-provider && npx tsc --noEmit
```

Expected: zero errors.

---

## Step 6 — Backend test suite

```bash
# api workspace
cd api && npx jest --testPathPattern="PermissionService|AuthService|openid" --passWithNoTests

# packages/data-schemas workspace
cd packages/data-schemas && npx jest

# packages/api workspace
cd packages/api && npx jest
```

Expected: all tests pass, no import errors.

---

## Step 7 — PermissionService smoke check

```bash
# Verify exports still intact (node -e should not throw)
node -e "const ps = require('./api/server/services/PermissionService'); console.log(Object.keys(ps).join(', '))"
```

Expected output includes: `grantPermission, checkPermission, getEffectivePermissions, getResourcePermissionsMap, findAccessibleResources, findPubliclyAccessibleResources, hasPublicPermission, getAvailableRoles, bulkUpdateResourcePermissions, ensurePrincipalExists, ensureGroupPrincipalExists, removeAllPermissions`

Does NOT include: `syncUserEntraGroupMemberships`

---

## Step 8 — OboTokenService still works (not deleted)

```bash
node -e "const obo = require('./api/server/services/OboTokenService'); console.log(typeof obo.exchangeOboToken)"
```

Expected: `function`

---

## Summary Checklist

- [ ] Three files deleted and absent from filesystem
- [ ] Zero source references to `GraphApiService`, `GraphTokenService`, `utils/graph`
- [ ] Zero source references to `idOnTheSource`
- [ ] Env vars removed from `.env.example`
- [ ] TypeScript compiles clean (zero errors)
- [ ] All backend tests pass
- [ ] `PermissionService` exports correct set (no `syncUserEntraGroupMemberships`)
- [ ] `OboTokenService.exchangeOboToken` still exported (MCP OBO preserved)
