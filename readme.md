# CollabDoc

> A real-time collaborative document editor built from scratch — no Firebase, no Operational Transform libraries, no shortcuts.

**Live demo → [collabdoc-client.onrender.com](https://collabdoc-client.onrender.com)**

---

## What is this?

CollabDoc lets multiple users edit the same document simultaneously without conflicts. Think Google Docs, but built from first principles.

The core problem with collaborative editing is **conflicting edits**. If two users type at the same time, their changes can overwrite each other or land in the wrong position. CollabDoc solves this using the **Eg-Walker algorithm** — a state-of-the-art approach to conflict-free collaborative editing published at EuroSys 2025 by Gentle & Kleppmann.

---

## Features

- **Real-time sync** — edits appear on all connected clients instantly
- **Conflict-free merging** — concurrent edits from multiple users always converge to the same result
- **Presence indicators** — see who else is in the document with colored avatars
- **Role-based access** — Owner, Editor, Viewer permissions enforced at both REST and WebSocket layers
- **Invite system** — owners can add/remove collaborators by username
- **JWT authentication** — register, log in, manage your own documents
- **Reconnection** — automatically reconnects with exponential backoff if connection drops
- **Warm analog UI** — parchment-toned typewriter aesthetic (JetBrains Mono + Special Elite fonts)

---

## The Problem: Why Collaborative Editing is Hard

Naive text sync breaks immediately under concurrent edits:

```
Initial state: "ac"

User A inserts 'b' at index 1  →  "abc"
User B inserts 'x' at index 1  →  "axc"

If we just apply both naively:
  A's op then B's op  →  "axbc"   ✗
  B's op then A's op  →  "abxc"   ✗
  (results differ — clients are out of sync forever)
```

The index-based positions that users send become invalid the moment someone else edits the document. Every collaborative editor needs a way to transform or reinterpret these positions so all clients converge to the same state.

---

## The Solution: Eg-Walker

### What is Eg-Walker?

Eg-Walker (Event Graph Walker) is a CRDT (Conflict-free Replicated Data Type) algorithm that treats the entire edit history as a **DAG (Directed Acyclic Graph)** of events rather than a flat sequence of operations. Every insert or delete is a node in this graph, with edges pointing to what came before it (its "parents").

```
                    [root]
                      │
             [insert 'a' at 0]          ← both users' common ancestor
              ╱                ╲
[ins 'b', parents=[a]]    [ins 'x', parents=[a]]   ← concurrent edits
              ╲                ╱
               [merged result]
               → YATA ordering resolves who goes left/right
               → same rule on every client → same result guaranteed
```

Instead of trying to transform operation indices on the fly (like Operational Transform does), Eg-Walker **replays** the event graph from a common ancestor to compute where each character belongs in the final document. This makes it simpler to reason about and immune to the subtle transformation bugs OT suffers from.

---

### Key Concepts

**Event Graph (DAG)**

Each edit event has:
- a unique `id`
- a `clientId` (who made it)
- `parents[]` — the IDs of events that formed the frontier when this edit was made
- `op` — either `{ type: 'insert', index, char }` or `{ type: 'delete', index }`

The graph captures the *causal history* of every edit. Two events with the same parent were concurrent.

```
[ins 'h'] ──► [ins 'e'] ──► [ins 'l'] ──► [ins 'l'] ──► [ins 'o']
                                 │
                            [del at 2]   ← concurrent with last [ins 'l']
                                 │
                      both share the same parent
                      → Eg-Walker resolves the final position correctly
```

---

**Prepare Phase (Retreat / Advance)**

When a new event arrives, Eg-Walker walks the graph to find the common ancestor between the current document state and the incoming event's parents. It then:

1. **Retreats** events that are in the current state but not in the incoming event's history — temporarily marks those characters as invisible so positions match what the sender saw
2. **Advances** events that are in the incoming event's parents but not yet in the current state — fast-forwards to reconstruct the sender's exact context

This puts the local CRDT sequence into the exact same state the sender saw when they made their edit, making the incoming `index` valid here too.

```
Client A's state: "hello world"   (has events 1–10)
Incoming from B:  insert at 5, parents=[event 3]

Eg-Walker:
  1. Retreat events 4–10  →  sequence appears as "hel"
  2. Advance to event 3   →  sequence appears as "hello"
  3. B's "insert at 5" is now valid — insert after 'o'
  4. Re-advance events 4–10  →  "hello world" + new char in right place
```

---

**Effect Phase (YATA Integration)**

After preparing the correct context, the new character is inserted using **YATA** (Yet Another Transformation Approach) ordering. YATA records the IDs of the characters immediately to the left (`originLeft`) and right (`originRight`) at the time of insert. When two characters compete for the same slot, YATA uses these references — plus a deterministic tiebreaker on `clientId` — to decide the final order.

```
Two users insert at the same position simultaneously:

User A: insert 'X' with originLeft='e', originRight='l'
User B: insert 'Y' with originLeft='e', originRight='l'

YATA rule: compare clientIds lexicographically as tiebreaker
→ consistent result on every client regardless of arrival order
→ "XY" or "YX" — the same everywhere
```

---

**Retreat / Advance State Machine**

Each character in the sequence tracks two values:

```
sp (Prepare State):   how many concurrent deletes cover this character
                      during the prepare phase
                      0  = visible in prepare context
                      >0 = retreated (temporarily hidden)

se (Effect State):    Ins = character is present in the final document
                      Del = character has been permanently deleted
```

`retreat()` and `advance()` only touch `sp`, keeping prepare-phase manipulation completely isolated from the actual document state. The final visible content is derived only from `se`.

---

### Our Implementation

The full Eg-Walker algorithm lives entirely on the **client**. Three files implement it:

```
client/src/crdt/
├── egWalker.ts       ← top-level: applyEvent(), drives retreat/advance loop,
│                        calls applyInsert() or applyDelete(), tracks
│                        prepareVersion and effectVersion frontiers
│
├── eventGraph.ts     ← the DAG: addEvent(), getFrontier(),
│                        topologicalSort() (Kahn's algorithm),
│                        diff() — computes toRetreat and toAdvance sets
│                        from two frontier versions
│
└── crdtSequence.ts   ← the character sequence: integrate() with YATA
                         conflict ordering, retreat(), advance(),
                         getEffectIndex() (maps prepare-index → effect-index),
                         findByPrepareIndex()
```

The server has **zero CRDT code**. It stores raw `EgEvent` objects in PostgreSQL and replays them to new joiners — nothing more. Every client runs the full algorithm locally and arrives at identical state independently.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                     │
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  React UI   │◄──►│  EgWalker    │◄──►│  useWebSocket │  │
│  │  (textarea) │    │  (CRDT core) │    │  (WS client)  │  │
│  └─────────────┘    └──────────────┘    └───────┬───────┘  │
│                           ▲                      │          │
│                           │ applies events        │          │
└───────────────────────────┼──────────────────────┼──────────┘
                            │              WebSocket (wss://)
┌───────────────────────────┼──────────────────────┼──────────┐
│                      SERVER (Node.js)             │          │
│                                                   │          │
│  ┌─────────────┐    ┌──────────────┐    ┌────────▼───────┐  │
│  │  REST API   │    │  opService   │◄───│   wsHandler    │  │
│  │  (Express)  │    │  (DB store)  │    │  (dumb relay)  │  │
│  └──────┬──────┘    └──────┬───────┘    └────────────────┘  │
└─────────┼──────────────────┼──────────────────────────────────┘
          │                  │
          ▼                  ▼
┌──────────────────────────────┐
│   PostgreSQL (Supabase)      │
│   Users · Documents · Events │
│   DocMembers · InviteLinks   │
└──────────────────────────────┘
```

### Key design decision: Dumb relay server

The server does **no CRDT processing**. It stores raw edit events and relays them to other clients. Every client runs Eg-Walker locally. This eliminates an entire class of race conditions that occur when a central server tries to be the authority on document state.

```
User A types 'b'                  User B types 'x'
      │                                  │
      ▼                                  ▼
 EgWalker (client A)            EgWalker (client B)
 generates EgEvent #1           generates EgEvent #2
      │                                  │
      └──────────────► SERVER ◄──────────┘
                           │
                    stores both events
                    (zero CRDT processing)
                           │
               ┌───────────┴────────────┐
               ▼                        ▼
        relays Event #2         relays Event #1
        to Client A             to Client B
               │                        │
               ▼                        ▼
       EgWalker merges          EgWalker merges
       → "bx" or "xb"          → "bx" or "xb"
           ✓ same                   ✓ same
```

---

## WebSocket Message Flow

```
Client                              Server
  │                                   │
  │── join_doc { docId } ────────────►│
  │                                   │  load all events from DB
  │◄── doc_state { events[] } ────────│
  │                                   │
  │  replay all events through        │
  │  local EgWalker                   │
  │  → reconstruct full document      │
  │                                   │
  │  [user types something]           │
  │  diffContent() → EgEvent[]        │
  │  applyEvent() locally first       │
  │                                   │
  │── operation { event } ───────────►│
  │                                   │  save to DB (serial queue)
  │◄── ack { eventId } ───────────────│  broadcast to other clients
  │                                   │
  │◄── op_broadcast { event } ────────│  (other clients receive this)
  │                                   │
  │  applyEvent() → transformedOp     │
  │  patch textarea content           │
  │                                   │
  │── cursor { position } ───────────►│
  │◄── cursor_broadcast ──────────────│  (to all others in room)
  │◄── presence_update { users[] } ───│  (on join/leave)
```

---

## Data Model

```
User
 │  id, email, username, passwordHash
 │
 ├──owns──► Document
 │           │  id, title, ownerId
 │           │
 │           ├──has──► Event[]
 │           │          id            (CRDT EventId — not auto-generated)
 │           │          clientId
 │           │          parentsJson   (EventId[] stored as JSON)
 │           │          op            (InsertOp | DeleteOp as JSON)
 │           │          sequenceNum   (for ordered replay to new joiners)
 │           │
 │           └──has──► InviteLink[]
 │                      token, role, maxUses, expiresAt, usedCount
 │
 └──member──► DocMember
               userId, documentId
               role: OWNER | EDITOR | VIEWER
```

---

## Tech Stack

```
Frontend                        Backend
──────────────────────          ──────────────────────────
React 18 + TypeScript           Node.js + TypeScript
Vite                            Express
Custom Eg-Walker CRDT           Raw ws (WebSocket library)
useWebSocket hook               Prisma v6 ORM
CSS variables                   JWT authentication
Parchment/typewriter theme      Zod validation
                                express-rate-limit
                                Per-doc serial promise queue

Database                        Deployment
──────────────────────          ──────────────────────────
PostgreSQL                      Render (server + client)
Supabase (managed)              Supabase (managed DB)
```

---

## Project Structure

```
collabdoc/
├── client/
│   └── src/
│       ├── crdt/
│       │   ├── egWalker.ts        # Core algorithm: retreat/advance/integrate
│       │   ├── eventGraph.ts      # DAG with topological sort + diff
│       │   ├── crdtSequence.ts    # Sequence with YATA insertion ordering
│       │   └── types.ts
│       ├── hooks/
│       │   ├── useWebSocket.ts    # WS client, ack queue, reconnect
│       │   └── useTextareaEditor.ts  # diff → events, apply remote ops
│       ├── components/
│       │   └── InvitePanel.tsx    # Member management modal
│       └── pages/
│           ├── EditorPage.tsx     # Main editor + presence
│           ├── DashboardPage.tsx
│           ├── LoginPage.tsx
│           └── RegisterPage.tsx
│
└── server/
    └── src/
        ├── ws/
        │   ├── wsServer.ts        # WS server, JWT auth, rate limiting
        │   ├── wsHandler.ts       # Dumb relay: join, operation, cursor
        │   └── messageTypes.ts    # Zod schemas for WS messages
        ├── services/
        │   └── opService.ts       # Event persistence + serial queue
        ├── controllers/
        │   ├── authController.ts
        │   ├── docController.ts
        │   └── inviteController.ts
        └── prisma/
            └── schema.prisma
```

---

## Running Locally

**Prerequisites:** Node.js 18+, a PostgreSQL database (or Supabase project)

```bash
# Clone
git clone https://github.com/Dhruvraj1821/collabdoc
cd collabdoc

# Server
cd server
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET, CLIENT_URL
npm install
npx prisma migrate dev
npm run dev                 # :3000

# Client (new terminal)
cd client
npm install
npm run dev                 # :5173
```

**Server `.env`**
```
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-here
CLIENT_URL=http://localhost:5173
PORT=3000
NODE_ENV=development
```

**Client `.env.development`**
```
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
```

---

## Known Limitations / V2 Ideas

- **Snapshot compaction** — the `Snapshot` table exists in the schema but isn't wired up. Every event is stored forever; compaction would periodically collapse old events into a single text snapshot, capping DB growth.
- **Cursor rendering** — cursor positions are broadcast but not visually rendered in the textarea (hard to do accurately without a rich editor).
- **Undo** — the event graph structure makes per-user undo theoretically tractable, but not yet implemented.

---

## References

- Gentle, J. & Kleppmann, M. — *"Eg-walker: Online and incremental transformations for collaborative editing"*, EuroSys 2025