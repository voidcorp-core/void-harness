---
name: offline-first-mutation
description: Implement a UI mutation that keeps working offline using capture-queue + sync pattern (IndexedDB, optimistic UI, idempotency keys, retry, conflict resolution). The Solaar-grade pattern.
---

# offline-first-mutation

Use when implementing **any user-triggered write** in a PWA that must succeed when the device is offline (mobile in subway, mobile in field, flaky wifi) and reconcile when connectivity returns. Composes with `void-server:server-action` (the sync target) and `void:async-safety` (retry discipline).

If the mutation is read-only or the user can tolerate "please try again when online", this skill does not apply.

## When this skill triggers

- "User taps the save button" / "user posts a comment" / "user updates a profile field"
- "Capture this action even if offline"
- Any flow where dropping the user's input is a product failure

## The model (capture-queue + sync)

```
┌────────────┐    enqueue    ┌─────────────┐    sync()    ┌──────────────┐
│ UI write   │ ────────────► │ IndexedDB   │ ───────────► │ Server Action │
│ (optimistic│               │ capture     │              │ (void-server) │
│  update)   │               │ queue       │              └──────────────┘
└────────────┘               └─────────────┘                       │
       ▲                            │                              ▼
       │       conflict ?           │                       commit | reject
       └────────────────────────────┴───── server wins ────────────┘
```

Three guarantees:

1. **Local first**: UI updates synchronously from the optimistic state — the user never waits for the network.
2. **Durable**: the intent is persisted to IndexedDB **before** the UI confirms; an immediate browser crash doesn't lose it.
3. **Idempotent**: each intent carries a client-generated `idempotencyKey` so retries are safe.

## Anatomy of an intent

```ts
type Intent<TPayload> = {
  readonly id: string;                  // client UUID, also serves as idempotencyKey
  readonly kind: string;                // 'note.create', 'contact.update', etc.
  readonly payload: TPayload;           // serializable
  readonly createdAt: number;           // epoch ms (client clock — used for ordering, not for truth)
  readonly attempts: number;            // bumped on each retry
  readonly status: 'pending' | 'syncing' | 'committed' | 'failed';
  readonly lastError?: { code: string; message: string };
};
```

`status` transitions:

- `pending` → `syncing` (sync picks it up, network in-flight)
- `syncing` → `committed` (server returned 2xx)
- `syncing` → `pending` (retryable error: network, 5xx, 429 — schedule next attempt with backoff)
- `syncing` → `failed` (non-retryable: 4xx other than 429 — surface to user, do not retry automatically)

## Use it in a component

```tsx
import { useOfflineMutation } from '@voidcorp/pack-pwa/offline';

function NoteForm() {
  const create = useOfflineMutation({
    kind: 'note.create',
    action: createNoteAction,            // your Server Action (void-server)
    optimistic: (payload) => ({ id: crypto.randomUUID(), ...payload, status: 'pending' }),
  });

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      create({ title: titleRef.current.value, body: bodyRef.current.value });
      // Form clears immediately — the optimistic note is in the list already.
    }}>...</form>
  );
}
```

`create(payload)` returns immediately. The hook:

1. Generates `idempotencyKey` (UUID v7 so it's sortable + client-time-correlated)
2. Persists the intent to IndexedDB
3. Updates the UI cache optimistically (the new note appears in the list, marked `status: 'pending'`)
4. Returns control to the user
5. Background: `sync()` picks it up when online

## Server-side idempotency

The Server Action MUST honor `idempotencyKey`:

```ts
export const createNote = defineAction({
  name: 'note.create',
  input: z.object({ idempotencyKey: z.string().uuid(), title: z.string(), body: z.string() }),
  handler: async ({ input, user }) => {
    // Inbox pattern: check if we've already committed this key.
    const existing = await db.query.notes.findFirst({
      where: eq(notes.idempotencyKey, input.idempotencyKey),
    });
    if (existing) return { ok: true, data: existing };       // safe re-deliver
    // Otherwise create + commit.
    ...
  },
});
```

The `idempotencyKey` column on the notes table needs a unique index. This pairs with `void-server:drizzle-migration-safe` when you add it.

## Conflict resolution

When the server response contradicts the local optimistic state (e.g., a concurrent edit from another device), the **server wins**. Two cases:

- **Field-level conflict** (last-write-wins): server returns its version, hook overwrites the optimistic state.
- **Validation rejection** (e.g., title became required): hook marks intent as `failed`, surfaces a toast to the user with the option to edit and retry.

For richer reconciliation (operational transforms, CRDTs), don't try to roll your own — use Yjs or Automerge. Outside this skill's scope.

## Backoff schedule

Default retry intervals: **2s, 5s, 15s, 60s, 5min, 30min, 4h**. After 4h with no success, mark `failed` and notify the user. Override via `useOfflineMutation({ backoffMs: [1000, 3000, 10000] })`.

Pause sync entirely when `navigator.onLine === false`. Resume on `online` event.

## Dead-letter

Intents in `failed` status surface in a dead-letter UI (`Settings → Pending sync`) where the user can:

- Retry manually
- Edit and resubmit (creates a new intent, discards the old)
- Delete (drops the change permanently)

Never silently drop a failed intent — the user wrote it, it's their data.

## Anti-patterns

- ✗ **Optimistic update without persistence**: tab close = lost data.
- ✗ **Client-generated IDs that aren't UUID v7 / ULID**: ordering breaks across devices.
- ✗ **`idempotencyKey` reused across mutations**: server returns the wrong response.
- ✗ **Showing "Saved!" toast on enqueue**: lies to the user — sync hasn't happened. Use "Captured" or no toast.
- ✗ **Catching `failed` errors and swallowing them**: dead-letter MUST be visible.

## Composition

- `void-server:server-action` — the sync target; idempotency-key handling lives there.
- `void:async-safety` — backoff schedule, dead-letter, bounded retry.
- `void-server:drizzle-migration-safe` — adding the `idempotencyKey` unique index.
- `void-react:01-react.md` — components consume via `useOfflineMutation`, no direct IndexedDB access.
- `void:observability` — log sync attempts with `idempotencyKey` so a failed intent can be traced end-to-end.
