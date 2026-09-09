# Mobile Prompt — Today's Schedule Tasks (Open / Done)

**Give this entire document to the Flutter / React Native developer.**

---

## Product rule

Admin Ops creates tasks linked to a guest booking (ZN code). Those tasks appear in the guest app **Today's Schedule**.

| Admin action (Tasks board) | Guest app |
|---|---|
| Create task linked to ZN | Shows under **Open** |
| Press **Complete** | Leaves **Open**, appears under **Done** |

Guest does **not** complete tasks. Only ops/admin marks them done. Guest only views Open vs Done.

---

## Auth

```http
Authorization: Bearer <accessToken>
```

| Env | Base |
|-----|------|
| Production | `https://zeengobackend-production.up.railway.app/api/v1` |
| Local | `http://localhost:3000/api/v1` |

---

## Today's Schedule UI (required)

Two tabs / filters:

1. **Open** → `status: "open"` (`completedAt: null`)
2. **Done** → `status: "done"` (`completedAt` set)

After admin Completes a task, refresh → it must **only** show in Done, never still in Open.

---

## Preferred API (one call, both lists)

```http
GET /api/v1/client/tasks
```

Default `filter=all`. Response:

```json
{
  "success": true,
  "data": {
    "znCode": "ZN0006",
    "bookingId": "uuid",
    "open": [
      {
        "id": "uuid",
        "title": "tour to the misichilli garden in moscow",
        "description": "…",
        "priority": "urgent",
        "status": "open",
        "dueDate": "2026-09-09",
        "completedAt": null,
        "bookingId": "uuid",
        "znCode": "ZN0006",
        "createdAt": "ISO-8601",
        "updatedAt": "ISO-8601"
      }
    ],
    "done": [
      {
        "id": "uuid",
        "title": "Take the dinner at the moscow resturants",
        "description": null,
        "priority": "urgent",
        "status": "done",
        "dueDate": "2026-09-09",
        "completedAt": "2026-09-09T10:00:00.000Z",
        "bookingId": "uuid",
        "znCode": "ZN0006",
        "createdAt": "ISO-8601",
        "updatedAt": "ISO-8601"
      }
    ],
    "counts": { "open": 4, "done": 1, "total": 5 },
    "meta": { "total": 5, "page": 1, "limit": 20, "totalPages": 1 }
  }
}
```

**Wire UI like this:**

| Tab | Array |
|-----|--------|
| Open | `data.open` |
| Done | `data.done` |
| Badge counts | `data.counts.open` / `data.counts.done` |

Optional single-tab fetches:

```http
GET /api/v1/client/tasks?filter=open
GET /api/v1/client/tasks?filter=done
```

---

## Home snapshot (same lists)

```http
GET /api/v1/client/home
```

| Field | Use |
|---|---|
| `open` | Open tab preview |
| `done` | Done tab preview |
| `tasks` | Same as `open` (legacy) |
| `taskCounts.open` / `.done` / `.total` | Badges |
| `todayProgram` | Itinerary activities (not ops tasks) |

---

## Recommended screen flow

```
Today's Schedule
  ├─ One fetch: GET /client/tasks  (or /client/home)
  ├─ Tab Open  → render response.open
  └─ Tab Done  → render response.done

On pull-to-refresh / screen focus → re-fetch
```

---

## Realtime (optional)

Socket.IO `/ws` with `auth: { token: accessToken }`.

| Event | Action |
|---|---|
| `task.updated` | If booking/zn is this guest → refresh Open + Done |
| `notification.new` | If task-related → refresh |

When admin taps Complete: `status` → `"done"`, move card Open → Done (or refetch).

---

## Display rules

- Show `title`, optional `description`, `priority` (`urgent` \| `normal`), `dueDate`
- Open: only items with `status === "open"`
- Done: only items with `status === "done"`; can show `completedAt`
- Empty Open: “No open tasks”
- Empty Done: “No completed tasks yet”

---

## Do not

- Do not call staff `POST /tasks/:id/complete` from the guest app
- Do not invent a third status — only `open` and `done`
- Do not leave a completed task in the Open list after refresh

---

## Acceptance test

1. Admin creates task for guest’s ZN → guest **Open** shows it.
2. Admin clicks **Complete** → guest **Open** no longer has it; **Done** has it with `status: "done"` + `completedAt`.
3. `counts` / `taskCounts`: open decreases, done increases.
