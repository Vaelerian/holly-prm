# Holly PRM - Phase 6c Design Spec

**Date:** 2026-04-12
**Status:** Approved
**Scope:** Phase 6c - Contact and Interaction Sharing

---

## Overview

Phase 6c adds three complementary sharing mechanisms so users can collaborate on contacts and interactions:

1. **Full contact book access** - admin creates a grant giving one user read+contribute access to another user's entire contact book
2. **Per-contact sharing** - a contact owner shares a specific contact with another user
3. **Project-linked contacts and interactions** - contacts and interactions can be attached to a project, making them visible to all project members

All three mechanisms use a "contribute" permission model: a non-owner can view a contact and log new interactions, but cannot edit or delete the contact or edit/delete existing interactions.

Shared contacts appear in the main contacts list, visually distinguished with a "Shared by [name]" label.

---

## Pillars

1. **Schema** - two new join tables, projectId on Contact and Interaction, createdByUserId on Interaction
2. **Access control** - unified OR clause in contact service covering all three access paths
3. **API routes** - admin grants CRUD, per-contact share CRUD, modified contact/interaction routes
4. **UI** - shared contacts in main list, sharing management section, admin grants panel

---

## Schema Changes

### New tables

#### UserAccessGrant

Full contact book access. Admin-created only.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| grantorId | String | FK to User, onDelete Cascade |
| granteeId | String | FK to User, onDelete Cascade |
| createdAt | DateTime | |

Unique constraint: `[grantorId, granteeId]`

Back-relations on User:
- `grantedAccess UserAccessGrant[]` (as grantor)
- `receivedAccess UserAccessGrant[]` (as grantee)

#### ContactShare

Per-contact access. Contact owner-managed.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| contactId | String | FK to Contact, onDelete Cascade |
| userId | String | FK to User, onDelete Cascade |
| createdAt | DateTime | |

Unique constraint: `[contactId, userId]`

Back-relation on Contact: `shares ContactShare[]`

### Modified models

#### Contact

Add:
- `projectId String?` - FK to Project, onDelete SetNull
- `project Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)`
- `shares ContactShare[]` - back-relation

#### Interaction

Add:
- `projectId String?` - FK to Project, onDelete SetNull
- `project Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)`
- `createdByUserId String?` - FK to User, onDelete SetNull - tracks who logged the interaction (null = contact owner)
- `createdByUser User? @relation("InteractionCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)`

The existing `Contact.userId` and `Interaction.userId` continue to mean "owner." When a contributor logs an interaction on a shared contact, the interaction gets `userId = contact.userId` (stays in owner's data namespace) and `createdByUserId = contributor.userId`.

#### Project

Add back-relation for both new FK fields:
- `linkedContacts Contact[]`
- `linkedInteractions Interaction[]`

---

## Access Control

### Access paths

A user has read+contribute access to a contact if any of the following is true:

1. `contact.userId = userId` (owner)
2. A `UserAccessGrant` exists with `grantorId = contact.userId AND granteeId = userId` (full book grant)
3. A `ContactShare` exists with `contactId = contact.id AND userId = userId` (per-contact share)
4. `contact.projectId` is set AND the user is a member of that project via `ProjectMember` (project-linked)

### accessWhere clause

A reusable Prisma `where` condition used in all contact queries:

```ts
function contactAccessWhere(userId: string) {
  return {
    OR: [
      { userId },
      { user: { grantedAccess: { some: { granteeId: userId } } } },
      { shares: { some: { userId } } },
      { project: { OR: [{ userId }, { members: { some: { userId } } }] } },
    ],
  }
}
```

This function lives in `lib/services/contacts.ts` and is applied to every `prisma.contact.findMany`, `prisma.contact.findFirst`, and `prisma.contact.findUnique` call.

### Permission levels

- **Owner** (`contact.userId = userId`): full CRUD on contact, full CRUD on its interactions and action items
- **Contributor** (any other access path): read contact, add new interactions (with `createdByUserId` set), read existing interactions and action items. Cannot edit/delete the contact. Cannot edit/delete existing interactions.

Ownership check helper: `isContactOwner(contact, userId): boolean` - returns `contact.userId === userId`.

---

## File Structure

### New files

- `lib/services/sharing.ts` - `UserAccessGrant` and `ContactShare` CRUD functions
- `app/api/admin/access-grants/route.ts` - GET (list all), POST (create)
- `app/api/admin/access-grants/[id]/route.ts` - DELETE (revoke)
- `app/api/v1/contacts/[id]/shares/route.ts` - GET (list), POST (add by email)
- `app/api/v1/contacts/[id]/shares/[userId]/route.ts` - DELETE (remove)
- `components/contacts/sharing-section.tsx` - sharing management UI (owner-only, shown on contact detail)
- `components/admin/access-grants-panel.tsx` - admin grants list + create/revoke UI

### Modified files

- `prisma/schema.prisma` - add UserAccessGrant, ContactShare, projectId/createdByUserId fields
- `lib/services/contacts.ts` - apply `contactAccessWhere`, add `isContactOwner` helper, gate write ops
- `lib/services/interactions.ts` - set `createdByUserId` on contributor-created interactions, gate edit/delete
- `app/api/v1/contacts/route.ts` - use `contactAccessWhere`
- `app/api/v1/contacts/[id]/route.ts` - use `contactAccessWhere` for reads; owner-only for PATCH/DELETE
- `app/api/v1/contacts/[id]/interactions/route.ts` - set `createdByUserId` on POST; contributor access for GET
- `app/(dashboard)/contacts/page.tsx` - show "Shared by [name]" label on shared contacts
- `app/(dashboard)/contacts/[id]/page.tsx` - show "Shared by [name]" label; show/hide edit, delete, sharing UI based on ownership
- `app/(dashboard)/admin/page.tsx` (or admin layout) - add Access Grants tab

---

## Service Layer: `lib/services/sharing.ts`

```ts
// UserAccessGrant
export async function listAccessGrants(): Promise<GrantWithUsers[]>
export async function createAccessGrant(grantorEmail: string, granteeEmail: string): Promise<UserAccessGrant>
export async function deleteAccessGrant(id: string): Promise<boolean>

// ContactShare
export async function listContactShares(contactId: string): Promise<ShareWithUser[]>
export async function createContactShare(contactId: string, email: string, ownerId: string): Promise<ContactShare>
export async function deleteContactShare(contactId: string, sharedUserId: string, ownerId: string): Promise<boolean>
```

`createAccessGrant` returns 404 if either email does not resolve to a User. Returns 409 if grant already exists.

`createContactShare` returns 404 if email does not resolve to a User. Returns 409 if share already exists. Returns 403 if `ownerId !== contact.userId`.

`deleteContactShare` returns false if share not found or `ownerId !== contact.userId`.

---

## API Routes

### Admin: Access Grants

**`GET /api/admin/access-grants`**
- Admin session required (role = "admin")
- Returns array of `{ id, grantor: { name, email }, grantee: { name, email }, createdAt }`

**`POST /api/admin/access-grants`**
- Admin session required
- Body: `{ grantorEmail: string, granteeEmail: string }`
- Returns 404 `{ error: "Grantor not found" }` or `{ error: "Grantee not found" }` as appropriate
- Returns 409 `{ error: "Grant already exists" }` if duplicate
- Returns 201 with created grant on success

**`DELETE /api/admin/access-grants/[id]`**
- Admin session required
- Returns 404 if not found, 200 on success

### Contact Shares (owner only)

**`GET /api/v1/contacts/[id]/shares`**
- Requires session.userId = contact.userId (owner only)
- Returns 404 if contact not found or not owned by caller
- Returns array of `{ id, user: { name, email }, createdAt }`

**`POST /api/v1/contacts/[id]/shares`**
- Requires session.userId = contact.userId
- Body: `{ email: string }`
- Returns 404 `{ error: "User not found" }` if email doesn't match a User
- Returns 409 `{ error: "Already shared with this user" }` if duplicate
- Returns 201 with share on success

**`DELETE /api/v1/contacts/[id]/shares/[userId]`**
- Requires session.userId = contact.userId
- Returns 404 if share not found, 200 on success

### Modified: Contacts

**`GET /api/v1/contacts`** - applies `contactAccessWhere(userId)` instead of `{ userId }`

**`GET /api/v1/contacts/[id]`** - uses `contactAccessWhere`; includes `userId` and `user.name` in response so UI can show "Shared by [name]"

**`PATCH /api/v1/contacts/[id]`** - requires `contact.userId = session.userId` (owner only)

**`DELETE /api/v1/contacts/[id]`** - requires `contact.userId = session.userId` (owner only)

### Modified: Interactions

**`GET /api/v1/interactions?contactId=[id]`** - accessible to owners and contributors (verifies contact access via `contactAccessWhere`); includes `createdByUser: { name }` in each interaction

**`POST /api/v1/interactions`** - accessible to owners and contributors when `contactId` resolves to an accessible contact; sets `createdByUserId = session.userId` when `session.userId !== contact.userId`; `userId` is always set to `contact.userId`

**`PUT /api/v1/interactions/[id]`** - requires `interaction.userId = session.userId` (owner only); returns 403 if contributor attempts update

**`DELETE /api/v1/interactions/[id]`** - requires `interaction.userId = session.userId` (owner only); returns 403 if contributor attempts delete

---

## UI

### Contacts list page

Shared contacts appear in the main contacts list alongside owned contacts. For each contact where `contact.userId !== session.userId`, render a "Shared by [name]" label in small secondary text beneath the contact name.

### Contact detail page

- Shows "Shared by [name]" badge at the top when contact is not owned by the viewer
- **Owner view**: full edit/delete buttons visible; "Sharing" section at the bottom
- **Contributor view**: edit/delete buttons hidden; no sharing section; add interaction button visible
- Each interaction shows "Logged by [name]" when `createdByUser` is set

### Sharing section (owner only, bottom of contact detail)

- Lists current shares: user name, email, revoke button
- "Share with..." text input + button: enter email to add a share
- Shows inline error if email not found or already shared

### Admin: Access Grants panel

New tab in the admin dashboard (alongside the existing Users tab). Shows a table of all grants: grantor name/email, grantee name/email, created date, revoke button. Form above the table: two email inputs (grantor, grantee) + Create button. Inline errors for not-found or duplicate.

---

## Error Handling

| Scenario | Response |
|----------|----------|
| Non-owner attempts PATCH/DELETE on contact | 403 `{ error: "Forbidden" }` |
| Non-owner attempts edit/delete on interaction | 403 `{ error: "Forbidden" }` |
| Share/grant target email not found | 404 `{ error: "User not found" }` |
| Duplicate share or grant | 409 `{ error: "Already shared with this user" }` or `{ error: "Grant already exists" }` |
| Non-owner attempts to manage shares | 403 `{ error: "Forbidden" }` |
| Non-admin attempts to manage access grants | 401 `{ error: "Unauthorized" }` |
| Contact not found or no access | 404 |

---

## Security

- All access checks use `session.userId` from JWT - never from request body
- Ownership checks are explicit: `contact.userId === session.userId` - access grant does not confer ownership
- Contributors cannot escalate to owner-level operations
- Admin access grant routes check `session.role === "admin"`
- `createdByUserId` is set server-side, never accepted from client

---

## Out of Scope for Phase 6c

- Sharing projects themselves (already handled by ProjectMember from Phase 6a)
- Email notifications when a contact is shared with you
- Revoking your own access (grantee removing themselves)
- Interaction-level sharing (sharing individual interactions without sharing the contact)
- Sharing action items directly
