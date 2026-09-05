# PanCafe — POS & Inventory Suite

A modern, bilingual (العربية / English) **point-of-sale, inventory and shift-management** suite
for a small warehouse/store — rebuilt from a vanilla-JS prototype into a typed, testable stack:

- **Frontend:** React 18 + TypeScript + Vite + Bootstrap 5 (RTL), Font Awesome, custom CSS animations
- **Backend:** Express + [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) REST API
- **Database:** a real SQLite file on disk, ready to be swapped for **MySQL / PostgreSQL** when your
  production backend is ready (see [Database & future backend](#database--future-backend))

> The old prototype (original HTML/CSS/JS) is preserved untouched in [`legacy/`](./legacy).

---

## Table of contents

- [Features](#features)
- [Screens & workflows](#screens--workflows)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [REST API](#rest-api)
- [Database schema](#database-schema)
- [Roles & permissions](#roles--permissions)
- [Database & future backend](#database--future-backend)
- [Backup & restore](#backup--restore)
- [Scripts](#scripts)
- [Roadmap](#roadmap)

---

## Features

- **Roles & auth** — Manager (`admin`) and cashier (`cashier`) accounts. Passwords are hashed with
  scrypt on the server; the client never sees them.
- **Sign-in with account picker** and quick **screen lock / unlock**.
- **Inventory** — grid & table views, instant search (name / barcode / code), live stock status
  (out / low / ok) with animated stock meters, add/edit/delete, **restock** with optional new unit cost.
- **POS** — tap-to-add product grid, cart with quantity steppers, customer name, discount,
  cash-received & change calculation, stock-aware validation, printable **thermal-style receipt**
  (monochrome `70mm` print sheet), auto-print toggle.
- **Shifts** — one active "drawer" at a time. Live KPIs (cash, invoices, pieces, cost & profit),
  **cash-drawer audit** (type the counted money → live shortage / overage / match detection),
  password-protected **shift close**, printable **closure & handover report**, then the drawer
  auto-resets to `0.00` and a fresh shift opens.
- **Reports** — current shift, all-today (manager), **per-cashier lookup** by shift, and an archive
  of closed shifts with totals, shortages/overages and per-item profit breakdowns.
- **CSV export** (UTF-8 BOM so Arabic opens cleanly in Excel).
- **Users management** (manager) — create/edit/delete users, change passwords.
- **Settings** — store name, currency, sounds, auto-print, receipt footer.
- **Backup & restore** — one-click JSON backup; restore also **imports legacy PanCafe v1 backups**.
- **i18n** — full Arabic + English dictionaries (426 keys each), RTL/LTR auto-switch, live toggle.
- **Sound effects** — synthesized Web-Audio clicks/chimes, no audio files.

---

## Screens & workflows

```
Title bar   → store name · current user · language · switch/lock/settings
Toolbar     → POS · Add item · Reports · Shift stats · Users · Backup · Lock
Inventory   → search + grid/table of items with stock status & quick-sell
Status bar  → live clock, active shift #, drawer cash, invoice count, item count
```

The main flows:

1. **Sell something** — `Toolbar → POS` (or the *Sell* button on any item). Add products, adjust
   quantities, enter cash received, `Complete sale`. Stock is deducted and the invoice recorded in
   SQL in one transaction. The receipt prints automatically (toggleable in Settings).
2. **Restock** — item card → truck icon → enter quantity (+ optional new cost).
3. **End of day** — `Toolbar → Shift stats & close`. Count the drawer, type the amount: the screen
   instantly shows **shortage / overage / match**. Confirm with your password → the shift is
   archived (with the audit figures), the drawer zeroed, and a print-ready closure report is shown.
4. **Analyze** — `Reports` for today/current-shift numbers or drill into any cashier or closed shift.

---

## Tech stack

| Layer    | Choice                                    | Why                                                                 |
| -------- | ----------------------------------------- | ------------------------------------------------------------------- |
| UI       | React 18 + **Bootstrap 5** (RTL build)    | Modern component model; official RTL stylesheet for Arabic           |
| Language | **TypeScript** (strict)                   | Shared contracts, safer refactors                                    |
| Build    | Vite 6                                    | Fast dev server + proxy to the API, small optimized bundles          |
| API      | Express 4                                 | Minimal, familiar, trivially swappable                               |
| Storage  | **better-sqlite3**                        | Real SQL + ACID transactions, zero-config single file, sync API      |
| i18n     | i18next / react-i18next                   | Two full dictionaries with **compile-time parity**                   |
| Icons    | Font Awesome 6 (CDN)                      | Familiar glyph set                                                    |

---

## Getting started

Prerequisites: **Node 20+** (developed on Node 24). Everything runs locally — no Docker needed.

```bash
# 1. install all workspaces (client, server, shared)
npm install

# 2. run API (:4000) + web client (:5173) together
npm run dev
```

Then open **http://localhost:5173**.

Default manager account:

```
username: admin
password: 123
```

> The SQLite file is created automatically at `server/data/pancafe.db` on first run.
> Reset it anytime with `npm run db:reset` (or just delete the file).

### Production-like run (single process)

```bash
npm run build   # type-checks + builds the client into client/dist
npm start       # API on :4000 also serves the built client at http://localhost:4000
```

---

## Project structure

```
.
├── client/                  # React SPA (Vite)
│   ├── index.html
│   └── src/
│       ├── App.tsx          # shell + modal wiring
│       ├── api.ts           # typed fetch client (all endpoints)
│       ├── store.tsx        # global store: session, toasts, modals, sounds, print
│       ├── i18n/            # ar.ts + en.ts dictionaries, i18next setup
│       ├── utils/           # formatting, CSV, sounds, receipt HTML builders
│       ├── components/      # UI primitives, overlays, shell (title/toolbar/status)
│       └── features/        # inventory · POS · reports · shift console · users · settings
│
├── server/                  # Express + better-sqlite3 API (tsx runtime)
│   ├── data/                # SQLite database file (created at runtime, gitignored)
│   └── src/
│       ├── index.ts         # entry
│       ├── app.ts           # express app + static client serving
│       ├── routes.ts        # all HTTP routes
│       ├── db.ts            # schema + migrations + seed
│       ├── util.ts          # ids, money, dates, scrypt hashing
│       └── *.ts             # domain modules: users, items, sales, shifts,
│                            #   reports (shared SQL aggregation), settings, backup
│
├── shared/src/index.ts      # canonical domain types + API contracts (single source of truth)
├── legacy/                  # the original vanilla-JS app, kept for reference
└── tools/check-i18n.ts      # verifies AR/EN dictionary parity (npm run check:i18n)
```

**DRY principles used:**

- Every entity type is defined **once** in `shared/src/index.ts` and imported by both sides — the
  API and the UI can never drift apart.
- All money math (shift totals, per-item profit, cashier lookup) lives in **one** server module
  (`reports.ts`) as SQL aggregations reused by the shift-close flow and every report screen.
- Server-side checkout recomputes prices & stock from the database — the client only sends
  `itemId` + `qty`.
- One print channel (`store.requestPrint`) serves both sale receipts and shift-closure reports.
- The `t('key')` checker enforces that Arabic and English stay in sync.

---

## REST API

All routes are under `/api` (JSON). Write endpoints take an `x-user-id` header so the server can
enforce manager-only operations.

| Method & path                     | Access    | Description                                     |
| --------------------------------- | --------- | ----------------------------------------------- |
| `GET  /api/health`                | public    | Server + DB status                              |
| `POST /api/auth/login`            | public    | Validate credentials → user                     |
| `GET  /api/users`                 | public*   | Users list (names/roles only, no passwords)     |
| `POST /api/users`                 | admin     | Create user                                     |
| `PUT  /api/users/:id`             | admin     | Update user                                     |
| `DELETE /api/users/:id`           | admin     | Delete user (not yourself)                      |
| `POST /api/users/:id/password`    | admin     | Change password (manager password required)     |
| `GET  /api/items`                 | logged in | List items                                      |
| `POST /api/items`                 | admin     | Create item                                     |
| `PUT /api/items/:id`              | admin     | Update item                                     |
| `DELETE /api/items/:id`           | admin     | Delete item                                     |
| `POST /api/items/:id/stock-in`    | admin     | Restock (qty + optional new cost)               |
| `POST /api/sales/checkout`        | logged in | Complete a sale (transactional stock deduction) |
| `GET  /api/shifts/active`         | logged in | Current shift (auto-creates if none)            |
| `POST /api/shifts/close`          | logged in | Close shift w/ drawer audit (credentials check) |
| `GET  /api/shifts/history`        | logged in | Closed shifts archive                           |
| `GET  /api/shifts/:id/report`     | logged in | Full aggregate report for one shift             |
| `GET  /api/reports/summary`       | logged in | Totals + item breakdown (`?scope=` & `cashier=`)|
| `GET  /api/reports/sales`         | logged in | Sale list for a scope                           |
| `GET  /api/settings`              | public    | Store settings                                  |
| `PUT  /api/settings`              | admin     | Save settings                                   |
| `GET  /api/backup/export`         | admin     | Full JSON backup                                |
| `POST /api/backup/import`         | admin     | Restore (new + legacy v1 format)                |

`?scope=` values: `active-shift` (default), `today`, `all`, `shift:<id>`. Combine with
`&cashier=<userId>` for per-cashier figures.

---

## Database schema

```
users      id · username(unique) · password(scrypt) · full_name · role(admin|cashier)
           · avatar · phone · created_at
items      id · code(BOX-01…) · name · category · icon · barcode · buy_price · sell_price
           · qty · min_qty · unit · notes · created_at · updated_at
shifts     id · shift_number · status(active|closed) · cashier_id · cashier_name
           · initial_cash · started_at · ended_at · closed_by
           · expected_cash · actual_cash · shortage · surplus · discrepancy · notes
           · invoice_count · items_qty
sales      id · invoice_no(INV-1000…) · shift_id → shifts · cashier snapshot · customer
           · subtotal · discount · total · paid · change · payment_method
           · date · time · created_at
sale_items sale_id → sales · item_id · name · unit · qty · price · buy_price · total
settings   key / value
```

`sale_items` **snapshots** the item name, unit and prices at the moment of the sale, so historical
reports stay correct even if a product is later edited or deleted. `shifts` records the drawer-audit
numbers (`expected/actual/shortage/surplus`) at close time — that’s the immutable handover record.

---

## Database & future backend

The API layer is deliberately thin. When you build the real production backend:

1. **Swap the data source** — SQLite is embedded, so SQL stays 95% portable: only the connection
   changes. better-sqlite3 is synchronous; on MySQL/Postgres you’ll add an async driver
   (e.g. `pg` / `mysql2`) and convert the route handlers to `async`. The domain functions in
   `server/src/*.ts` map 1:1 to prepared statements you can port directly.
2. **Replace the auth shim** — `x-user-id` headers are a local convenience; plug in sessions/JWT at
   the middleware layer without touching feature code.
3. The React client only knows REST endpoints (`client/src/api.ts`) — it never needs to change for
   a DB swap, and `shared/` keeps contracts in one place.

Suggested order: `server/src/db.ts` + `server/src/routes.ts` first, then the domain modules.

---

## Backup & restore

- **Export:** `Settings → Backup → Download backup (JSON)` (also a toolbar button for managers).
- **Restore:** `Settings → Restore from file…` — confirms first, replaces the warehouse dataset, and
  reloads.
- **Legacy import:** restoring an old PanCafe v1 backup (from the `legacy/` app) is supported —
  historical sales are archived into a synthetic closed shift and a fresh active shift is opened.

---

## Scripts

| Command               | What it does                                            |
| --------------------- | ------------------------------------------------------- |
| `npm run dev`         | API (`:4000`, tsx watch) + web client (`:5173`, Vite)   |
| `npm run dev -w server` | API only                                              |
| `npm run dev -w client` | Vite only                                            |
| `npm run build`       | Type-check + build the client (`client/dist`)           |
| `npm start`           | Run API, serving the built client on `:4000`            |
| `npm run typecheck`   | TypeScript across all workspaces                        |
| `npm run db:reset`    | Delete the SQLite file (fresh DB on next start)         |
| `npm run check:i18n`  | Verify Arabic/English dictionary parity                 |
| `npm run qa`          | Headless-Chrome flow test (needs API on `:4000` + built client) |

> **`npm run qa`** drives a real Chrome (via puppeteer-core) through sign-in → add item → POS
> sale → receipt → reports → drawer audit → shift close → language switch, asserts the key
> numbers, checks console errors and catches horizontal overflow, and saves screenshots under
> `qa-shots/`. Run `npm run build && npm start` first, then `npm run qa` in another terminal.

---

## Roadmap

- [ ] Multi-terminal sync (second cash register sharing the same drawer state)
- [ ] Receipt re-print & “view invoice” from reports
- [ ] Category & barcode scanning flows in the POS picker
- [ ] Product images
- [ ] Export shift reports as PDF
- [ ] Swap SQLite → Postgres backend with JWT auth (see above)

---

*Built with TypeScript, React, Bootstrap 5 (RTL) and better-sqlite3. The original prototype lives
in [`legacy/`](./legacy) for reference.*
