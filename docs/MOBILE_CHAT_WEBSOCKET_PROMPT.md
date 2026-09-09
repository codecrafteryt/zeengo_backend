# Mobile App Integration Prompt — Zeengo Client Chat + WebSocket

**Give this entire document to the Flutter / React Native developer.**

---

## Product context (read first)

Zeengo guest app has **one logged-in client user** per session (JWT `type: "client"`).

Chat is **not** an open “chat with all users” feed. For the guest it is:

1. Guest logs in (ZN booking code or password) → gets `accessToken`
2. Guest opens **Support chat for their trip** (booking / ZN)
3. That opens one **`booking_support`** thread shared with ops/support/admin (and assigned driver if any)
4. Guest sends/receives messages in that thread via REST + **Socket.IO WebSocket** for realtime

Staff see the same thread in the Admin panel Chat. Guest ↔ Support is the same conversation.

---

## Base URLs

| Env | REST API | WebSocket (Socket.IO) |
|-----|----------|------------------------|
| Production | `https://zeengobackend-production.up.railway.app/api/v1` | `https://zeengobackend-production.up.railway.app/ws` |
| Local | `http://localhost:3000/api/v1` | `http://localhost:3000/ws` |

**Important:** WS path is `/ws` (Socket.IO **namespace** `/ws`), not `/api/v1/ws`.

All REST responses:

```json
{ "success": true, "data": { ... } }
```

All authenticated REST calls:

```http
Authorization: Bearer <accessToken>
```

---

## Auth for chat

1. Login client (example ZN login):

```http
POST /api/v1/auth/client/login
Content-Type: application/json

{ "bookingCode": "ZN0001", "fcmToken": "optional-fcm-token" }
```

2. Save `data.accessToken` (and refresh token if returned).
3. Decode JWT if needed — `sub` = `clientId`, `type` must be `"client"`.
4. Use that token for **REST** and **WebSocket**.

---

## Recommended chat UX flow (single guest)

```
Login
  → GET /client/home  (get bookingId + znCode)
  → POST /chat/bookings/{bookingId}/thread   ← open / create support chat
  → Connect Socket.IO /ws with auth.token
  → GET /chat/conversations/{id}/messages
  → emit chat.join { conversationId }
  → Listen message.new / message.translated / chat.typing / message.read
  → Send via POST .../messages
  → Mark read via POST .../read
  → On leave screen: emit chat.leave
```

**Do NOT** call `GET /chat/client-threads` — that is **staff only** (403 for guests).

**Do NOT** create `team` or `dm` conversations from the guest app (403).

---

## REST APIs (client)

### 1) List my conversations

```http
GET /api/v1/chat/conversations
Authorization: Bearer <accessToken>
```

**Response `data`:** array of:

```json
{
  "id": "uuid",
  "type": "booking_support",
  "bookingId": "uuid",
  "title": "ZN0001 Support — Guest Name",
  "createdAt": "ISO-8601",
  "lastMessageAt": "ISO-8601 | null",
  "unreadCount": 2,
  "znCode": "ZN0001",
  "clientName": "Guest Name"
}
```

Usually the guest has **one** main support thread per active booking.

---

### 2) Open / create booking support thread (PREFERRED)

```http
POST /api/v1/chat/bookings/{bookingId}/thread
Authorization: Bearer <accessToken>
```

- No body
- Idempotent: returns existing thread if already created
- Guest must own that booking
- Thread participants: **this client** + ops/support/admin staff (+ assigned driver if any)

**Response `data`:** one Conversation object (same shape as list item).

Alternative equivalent:

```http
POST /api/v1/chat/conversations
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "type": "booking_support",
  "bookingId": "uuid-of-guest-booking"
}
```

---

### 3) Load messages (history)

```http
GET /api/v1/chat/conversations/{conversationId}/messages?limit=50
Authorization: Bearer <accessToken>
```

Pagination (older):

```http
GET /api/v1/chat/conversations/{conversationId}/messages?before={oldestMessageId}&limit=50
```

**Response `data`:** array of messages, oldest → newest.

---

### 4) Send message

```http
POST /api/v1/chat/conversations/{conversationId}/messages
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "body": "Hello, when is my airport pickup?",
  "attachments": []
}
```

Optional attachments:

```json
{
  "body": "Photo of my voucher",
  "attachments": [
    { "url": "https://cdn.example.com/file.jpg", "mime": "image/jpeg" }
  ]
}
```

**Response `data`:** Message object. Server also emits realtime `message.new`.

---

### 5) Mark as read

```http
POST /api/v1/chat/conversations/{conversationId}/read
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "lastMessageId": "uuid-of-last-visible-message" }
```

**Response:**

```json
{ "success": true, "data": { "read": true } }
```

---

## Message object (canonical)

```json
{
  "id": "uuid",
  "conversationId": "uuid",
  "senderType": "client",
  "senderRole": null,
  "senderStaffId": null,
  "senderClientId": "uuid",
  "senderName": "Guest Name",
  "body": "متى الاستقبال؟",
  "bodyTranslated": {
    "en": "...",
    "ar": "...",
    "ru": "..."
  },
  "sourceLang": "ar",
  "attachments": [],
  "createdAt": "2026-09-09T08:10:00.000Z"
}
```

Staff example: `"senderType": "staff", "senderRole": "driver" | "admin" | "splizer" | "support" | "ops_manager"`.

UI rules:

- If `senderType === "client"` and `senderClientId === myClientId` → show as **my bubble**
- If `senderType === "staff"` → show as inbound bubble; use `senderRole` for Support / Driver / Splizer tabs + label (`senderName`)
- Prefer display language from `bodyTranslated[lang]` if present, else `body`
- After send, `bodyTranslated` may be `{}` until `message.translated` arrives

---

## WebSocket (Socket.IO) — required for live chat

### Connect

**JS / React Native:**

```js
import { io } from 'socket.io-client';

const socket = io('https://zeengobackend-production.up.railway.app/ws', {
  transports: ['websocket', 'polling'],
  auth: { token: accessToken }, // REQUIRED — not query string
});

socket.on('connect', () => console.log('ws connected', socket.id));
socket.on('disconnect', (reason) => console.log('ws disconnected', reason));
socket.on('connect_error', (err) => console.log('ws error', err.message));
```

**Flutter (`socket_io_client`):**

```dart
final socket = IO.io(
  'https://zeengobackend-production.up.railway.app/ws',
  IO.OptionBuilder()
      .setTransports(['websocket'])
      .setAuth({'token': accessToken})
      .enableAutoConnect()
      .build(),
);
```

On connect, server auto-joins room `client:{clientId}`.  
That is enough to receive **messages** and **notifications** even before joining a conversation room.

---

### Listen (server → app)

| Event | When | What to do in UI |
|-------|------|------------------|
| `message.new` | New chat message | Append to open thread if `conversationId` matches; update conversation list preview + unread |
| `message.translated` | Translations ready | Update that message’s `bodyTranslated` |
| `message.read` | Someone marked read | Optional read receipts |
| `chat.typing` | Other user typing | Show “Support is typing…” (only if you joined the room) |
| `notification.new` | Any push-style inbox event | Update notification badge/inbox (chat may also appear here) |

Example handlers:

```js
socket.on('message.new', (msg) => {
  // msg = Message object
  if (msg.conversationId === openConversationId) {
    appendMessage(msg);
  }
  refreshConversationList();
});

socket.on('message.translated', (msg) => {
  patchMessageTranslations(msg.id, msg.bodyTranslated);
});

socket.on('chat.typing', (payload) => {
  // { conversationId, userType: 'staff'|'client', userId, role }
  if (payload.conversationId === openConversationId && payload.userType === 'staff') {
    showTypingIndicator();
  }
});

socket.on('message.read', (payload) => {
  // { conversationId, lastMessageId, readerType, readerId }
});

socket.on('notification.new', (n) => {
  // inbox / badge
});
```

---

### Emit (app → server)

| Event | Body | When |
|-------|------|------|
| `chat.join` | `{ "conversationId": "uuid" }` | User opens a chat screen |
| `chat.leave` | `{ "conversationId": "uuid" }` | User leaves chat screen |
| `chat.typing` | `{ "conversationId": "uuid" }` | User is typing (throttle ~700–1000ms) |

```js
socket.emit('chat.join', { conversationId }, (ack) => {
  // ack: { ok: true, conversationId } or { ok: false, error: 'FORBIDDEN'|'INVALID' }
});

socket.emit('chat.typing', { conversationId });

socket.emit('chat.leave', { conversationId });
```

**Critical:** Typing indicators only work after successful `chat.join`.  
Messages still arrive on `client:{id}` without join, but join is required for proper room presence + typing.

---

## Full integration checklist for mobile developer

- [ ] After login, store `accessToken`
- [ ] Connect Socket.IO to `{HOST}/ws` with `auth: { token: accessToken }`
- [ ] From `GET /client/home` (or bookings), get `bookingId`
- [ ] Call `POST /chat/bookings/{bookingId}/thread` → save `conversation.id`
- [ ] Load history: `GET .../messages?limit=50`
- [ ] `chat.join` that conversation
- [ ] Render bubbles using `senderType` / `senderClientId`
- [ ] Send with `POST .../messages`
- [ ] Optimistically show own message OR wait for REST response / `message.new` (dedupe by `id`)
- [ ] On open thread / new message visible → `POST .../read`
- [ ] While typing → throttled `chat.typing`
- [ ] On dispose → `chat.leave`
- [ ] On logout → `socket.disconnect()` and clear token
- [ ] On token refresh → reconnect socket with new token
- [ ] Never call staff-only `/chat/client-threads`
- [ ] Never create `team` / `dm` as client

---

## Dedupe tip (important)

When you send a message:

1. REST returns the saved message  
2. Socket also emits `message.new` to you  

Deduplicate by `message.id` so the bubble does not appear twice.

---

## Error cases to handle

| Case | Result |
|------|--------|
| Missing/invalid WS token | Socket disconnect / connect_error |
| `chat.join` on someone else’s thread | `{ ok: false, error: "FORBIDDEN" }` |
| Wrong bookingId on `/thread` | 403 / not found |
| Create `team`/`dm` as client | 403 |
| Expired access token | REST 401 → refresh then retry; reconnect WS |

---

## What “chat between users” means in Zeengo

For the **guest app**:

- One guest account ↔ **Support / Ops staff** on that guest’s booking thread  
- Not a social chat with all guests  
- Staff reply from Admin Chat; guest sees it live via `message.new`  
- Assigned driver may also be on the same booking support thread  

That is the correct product behavior.

---

## Minimal copy-paste sequence

```text
1. accessToken = login()
2. home = GET /client/home
3. thread = POST /chat/bookings/{home.bookingId}/thread
4. socket = io(HOST + "/ws", { auth: { token: accessToken } })
5. messages = GET /chat/conversations/{thread.id}/messages?limit=50
6. socket.emit("chat.join", { conversationId: thread.id })
7. socket.on("message.new", appendIfSameThread)
8. send = POST /chat/conversations/{thread.id}/messages { body }
9. read = POST /chat/conversations/{thread.id}/read { lastMessageId }
```

---

## Questions for backend (only if blocked)

- Confirm production `HOST`  
- Confirm test ZN code + that booking has an open thread  
- If translations stay empty: translation worker / Redis must be running (UI should still show `body`)

---

**End of mobile chat integration prompt**
