# Data Model Changes: Remove Azure Entra ID / Graph API Code

**Branch**: `001-remove-entra-graph` | **Date**: 2026-06-04

---

## User Schema (`packages/data-schemas/src/schema/user.ts`)

### Field removed: `idOnTheSource`

```
Before: idOnTheSource?: string   // Entra ID Object ID (oid claim)
After:  [field removed]
```

No database migration required — no existing users, field is undefined on all existing documents.

---

## IUser Interface (`packages/data-schemas/src/types/user.ts`)

### Removed fields

```typescript
// Before
export interface IUser extends Document {
  // ...
  idOnTheSource?: string;
  // ...
}

// After
export interface IUser extends Document {
  // idOnTheSource removed
}
```

### UserFilterOptions — removed field

```typescript
// Before
export interface UserFilterOptions extends CursorPaginationParams {
  // ...
  idOnTheSource?: string;
}

// After: idOnTheSource removed from filter options
```

---

## Group Schema (`packages/data-schemas/src/schema/group.ts`)

### Field removed: `idOnTheSource`

```
Before: idOnTheSource?: { type: String }   // Entra group object ID
After:  [field removed]
```

### Source enum simplified

```
Before: source: { type: String, enum: ['local', 'entra'] }
After:  source: { type: String, enum: ['local'] }
```

### Index removed

```
Before: { idOnTheSource: 1, source: 1, tenantId: 1 }   // partial index on idOnTheSource
After:  [index removed]
```

---

## IGroup Interface (`packages/data-schemas/src/types/group.ts`)

```typescript
// Before
export interface IGroup {
  source?: 'local' | 'entra';
  idOnTheSource?: string;
  memberIds?: string[];   // stored idOnTheSource values for Entra groups
  // ...
}

// After
export interface IGroup {
  source?: 'local';
  // idOnTheSource removed
  memberIds?: string[];   // stores MongoDB user ID strings for local groups
  // ...
}
```

---

## Group Methods (`packages/data-schemas/src/methods/userGroup.ts`)

### Removed methods (Entra-specific)

| Method | Reason |
|---|---|
| `findGroupByExternalId(idOnTheSource, source)` | Only called from `PermissionService.syncUserEntraGroupMemberships` |
| `findGroupsByExternalIds(ids, source, session)` | Same |
| `upsertGroupByExternalId(id, source, data, session)` | Same |

### Simplified method: `getUserGroups(userId)`

```typescript
// Before: checked user.idOnTheSource, used it as member lookup key if present
// After: always uses userId.toString() as the member lookup key
```

No behaviour change in practice — without Entra, `idOnTheSource` was always undefined, so the fallback path was already the only path.

---

## No Migration Required

All removed fields were only populated when `USE_ENTRA_ID_FOR_PEOPLE_SEARCH=true` (default: `false`). In a fresh deployment with no existing data, no documents contain these fields.
