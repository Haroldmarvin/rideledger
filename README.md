# RideLedger

**Bike Delivery Management & Accountability Platform**
*Track Every Ride. Account for Every Delivery.*

RideLedger replaces paper delivery sheets. Riders record each delivery on their phone as it happens. Management gets one dashboard showing deliveries, collections by payment method, outstanding balances, rider expenses, end-of-day cash handovers and a full audit trail.

---

## Features

**Riders (mobile-first, installable PWA)**
- Sign in once. The rider's identity, date, time and delivery ID are filled in automatically.
- One-screen "New Delivery" form with large tap targets, status and payment chips, remembered pickup and destination suggestions, and a live outstanding-balance preview. After saving, a fresh form opens so the rider can keep working.
- Today's summary: deliveries by status, fees, amount collected, outstanding balance, approved expenses and expected cash handover.
- Expense submission (Fuel, Bike Repair/Maintenance, Parking, Other) with receipt photo or PDF.
- End-of-day handover. The rider enters the cash handed over, and the system shows **Exact match / Short / Over**.
- Offline support: deliveries recorded without a connection are stored on the phone and labelled **"Saved Locally — Waiting for Connection" / "Pending Sync"**. They sync automatically when the connection returns, and each one is sent with an idempotency key so it can never be created twice.
- Riders can see only their own data. They cannot delete deliveries, and they cannot change a day once it has been submitted or closed. Changes after that go through correction requests.

**Management (desktop dashboard, also usable on mobile)**
- KPI cards: deliveries, successful deliveries, fees, collections, cash, electronic payments, outstanding, approved expenses, net amount due. All cards follow the date, rider, bike, status and payment filters.
- Charts: delivery trend, payment breakdown, rider comparison (factual figures only, no invented scores).
- Rider management: add, edit, activate/deactivate, reset password, assign bike, view performance and activity. Riders with history can only be deactivated, never deleted.
- Bike/fleet list with Active / Maintenance / Inactive status and rider assignment.
- Expense review: approve, or reject with a reason. Receipts can be viewed in the app.
- Reconciliation: confirm cash received (receiving officer, time, amount, notes) or return a handover to the rider. Confirming closes and locks the day.
- Correction requests: approve (the change is applied and the closeout recalculated) or reject, with a reason.
- Fee management with history. Each delivery stores the fee actually charged, so changing the default fee never alters past records.
- 10 reports (daily, individual rider, weekly, monthly, revenue/fees, payment collection, outstanding/unpaid, expenses, rider performance, cash reconciliation). Each can be filtered by date range, rider, bike, status and payment method, then viewed, printed, or exported to **PDF** and **Excel**.
- Audit log of every important action: user, action, record, previous and new values, time, IP address and device. The log is read-only and no API endpoint can delete entries.

---

## Technology

| Layer | Stack |
|---|---|
| Frontend | React 19, Vite, React Router, Bootstrap 5, Lucide icons, Axios, Recharts, vite-plugin-pwa |
| Backend | Node.js (18.18+), Express 4, Mongoose 8, JWT, bcrypt, Helmet, CORS, express-rate-limit, express-mongo-sanitize, Multer |
| Database | MongoDB (local or MongoDB Atlas) |
| Reports | ExcelJS (xlsx), PDFKit (pdf), print stylesheet |
| Tests | Jest, Supertest, mongodb-memory-server |

Architecture: `client (React)` → REST `/api` → `server (Express)` → MongoDB. The two apps are fully separate and deploy separately.

### Money handling
All amounts are stored and calculated as **integer cents** on the server (`$12.50` → `1250`). This avoids floating-point errors. The API sends and receives cents, and the client converts only for display and input. Every financial figure (outstanding amounts, totals, payment breakdowns, approved expenses, expected handover, differences) is calculated on the server. The browser's live figures are only a preview.

---

## Project structure

```
rideledger/
├── client/                    React + Vite frontend
│   ├── public/                PWA icons
│   └── src/
│       ├── components/        Reusable UI (cards, badges, modals, filters, money input…)
│       ├── context/           Auth, config and toast providers
│       ├── hooks/             useApi, useDebounce, useOnlineStatus, useSyncQueue…
│       ├── layouts/           RiderLayout (bottom nav) · AdminLayout (sidebar)
│       ├── pages/             rider/ · admin/ · shared/
│       ├── services/          api client, offline queue, file download
│       ├── styles/app.css
│       └── utils/
├── server/                    Express API
│   ├── config/                env, db, constants
│   ├── controllers/           one per resource
│   ├── middleware/            auth/RBAC, rate limits, uploads, errors
│   ├── models/                User, Rider, Bike, Delivery, Expense, DailyCloseout,
│   │                          CorrectionRequest, AuditLog, FeeConfiguration, Setting, Counter
│   ├── routes/index.js        all REST routes + role guards
│   ├── services/              calculations, policy, summaries, reports, exporters, storage…
│   ├── seed/seed.js           demo data
│   ├── tests/                 unit + integration (acceptance) tests
│   └── uploads/               local receipt storage (dev)
├── render.yaml                Render blueprint for the API
└── package.json               convenience scripts
```

---

## Requirements

- Node.js **18.18 or newer** (20 or 22 LTS recommended) and npm
- MongoDB **6+**: either a local server or a free MongoDB Atlas cluster

## Installation

```bash
git clone <your-repo-url> rideledger
cd rideledger
npm run install:all          # installs server/ and client/ dependencies

cp server/.env.example server/.env
cp client/.env.example client/.env    # optional in development
```

Edit `server/.env`. At minimum, set `MONGO_URI` and a random `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Environment variables

**server/.env**

| Variable | Example | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `production` in deployment |
| `PORT` | `5000` | API port |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/rideledger` | MongoDB connection string (local or Atlas) |
| `JWT_SECRET` | *(64+ random chars)* | Signs login tokens. In production it must be ≥ 32 characters and not the placeholder. |
| `JWT_EXPIRES_IN` | `12h` | Session length; users are logged out automatically after this time |
| `CLIENT_URL` | `http://localhost:5173` | Allowed frontend origin(s) for CORS, comma-separated |
| `UPLOAD_STORAGE` | `local` | Receipt storage provider (see *Receipt storage* below) |
| `UPLOAD_DIR` | `uploads` | Folder used by the local provider |
| `MAX_UPLOAD_MB` | `5` | Maximum receipt size |
| `BUSINESS_TZ` | `Africa/Monrovia` | Time zone that defines the "business day" |
| `LOGIN_RATE_LIMIT` | `20` | Login attempts per IP per 15 minutes |
| `SEED_DEMO_PASSWORD` | `RideLedger@2026` | Password given to seeded demo accounts |

**client/.env**

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | API base URL. Leave empty in development (Vite proxies `/api` to `localhost:5000`). In production, use e.g. `https://rideledger-api.onrender.com`. |
| `VITE_SHOW_DEMO` | `true` shows the demo-account buttons on the login page in a production build |

No real secrets are committed. `.env` files are git-ignored.

## Database setup

**Local MongoDB:** install MongoDB Community Server, start it, and keep `MONGO_URI=mongodb://127.0.0.1:27017/rideledger`.

**MongoDB Atlas:**
1. Create a free cluster at cloud.mongodb.com.
2. Under *Database Access*, create a database user.
3. Under *Network Access*, allow your IP address (and your host's outbound IPs, or `0.0.0.0/0`, for Render or Railway).
4. Choose *Connect → Drivers* and copy the URI, for example `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/rideledger?retryWrites=true&w=majority`.
5. Paste it into `MONGO_URI`.

Indexes are created automatically when the API starts.

## Seed demo data

```bash
npm run seed          # seeds only if the database is empty
npm run seed:fresh    # WIPES RideLedger collections, then seeds
```

The seed creates 1 admin, 5 riders, 5 bikes, about 14 days of deliveries (roughly 230, including part-payments and credit), about 28 expenses (approved, rejected, and some pending today), about 60 closeouts (confirmed days, with some short and over, plus yesterday's handovers awaiting confirmation), a fee change nine days ago, and matching audit entries. The dashboard therefore shows realistic data straight after installation.

## Demo accounts

Password for every demo account: **`RideLedger@2026`**

| Role | Login |
|---|---|
| Admin / management | `admin@rideledger.com` (username `admin`) |
| Rider (Samuel Kollie, bike BK-001) | `rider@rideledger.com` (username `rider`) |
| Other riders | `james.flomo@…`, `patrick.doe@…`, `emmanuel.g@…`, `mohammed.sheriff@rideledger.com` |

Change or remove these accounts before going live.

## Development

Run each app in its own terminal (Git Bash, PowerShell or any shell):

```bash
npm run dev:server    # API on http://localhost:5000 (nodemon)
npm run dev:client    # App on http://localhost:5173 (Vite, proxies /api)
```

Open http://localhost:5173. Riders are sent to `/rider` and admins to `/admin`. To test the rider experience on a real phone on the same Wi-Fi network, run `npm run dev -- --host` inside `client/` and open the network URL it prints.

## Tests

```bash
npm test                                  # all server tests
npm run test:unit --prefix server         # pure business logic (no database)
npm run test:integration --prefix server  # full API acceptance scenario
```

- **Unit tests** cover money parsing and formatting, the outstanding calculation, payment totals, approved-only expenses, expected handover, the difference calculation and its classification, delivery validation, and role/ownership/closed-day policy.
- **Integration tests** run spec §44 end to end: admin creates a rider and bike → rider records a delivery and an expense → admin approves → rider submits the handover → management confirms → the day is locked → a correction is approved → the audit trail is checked → Excel and PDF are exported. They also cover rider data isolation (a rider changing IDs or filters in the URL gets a 404), NoSQL injection, fee history and rider deactivation.

The integration tests start an in-memory MongoDB (`mongodb-memory-server` downloads a MongoDB binary the first time they run). To use a MongoDB server you already run, set `MONGO_TEST_URI=mongodb://127.0.0.1:27017/x`. A throwaway database is created and then dropped.

## Production build

```bash
npm run build          # client → client/dist (static files + service worker)
npm start              # API (NODE_ENV=production)
```

## Deployment

**Database: MongoDB Atlas.** Set it up as described above.

**API: Render** (Railway works the same way)
1. Push the repo to GitHub.
2. In Render, choose *New → Blueprint* and select the repo. `render.yaml` sets up the `rideledger-api` service with root `server/`, start command `npm start`, and health check `/api/health`.
3. Set `MONGO_URI` (Atlas) and `CLIENT_URL` (your Vercel URL). `JWT_SECRET` is generated automatically.
4. Once deployed, open the Render shell and run `npm run seed` if you want demo data.

On Railway: create a service from the repo, set the root directory to `server`, add the same variables, and use `npm start`.

**Frontend: Vercel**
1. *New Project* → select the repo → set **Root Directory** to `client`. The framework preset is Vite, the build command is `npm run build`, and the output directory is `dist`.
2. Add the environment variable `VITE_API_URL=https://<your-api>.onrender.com`.
3. Deploy. `client/vercel.json` rewrites routes to `index.html` so deep links work.
4. Put the Vercel URL into the API's `CLIENT_URL` and redeploy the API.

**Receipt storage in production.** The `local` provider writes files to `server/uploads`. Render and Railway disks are temporary unless you attach a persistent disk or volume, so for real use either attach one or add a cloud provider. Storage sits behind one small interface in `server/services/storage/`: create a file exporting `save / read / remove` (for example S3 or Cloudinary), register it in `storage/index.js`, and set `UPLOAD_STORAGE`.

---

## Key business rules (enforced by the backend)

1. Riders see only their own records. Ownership is checked on every query, so changing an ID in the URL returns 404.
2. Admins see everything.
3. Deliveries cannot be deleted (there is no DELETE route). Use the *Cancelled* status instead.
4. Outstanding = Delivery Fee − Amount Collected, always calculated by the server. A negative balance (overpayment) is only allowed when an admin explicitly authorizes it.
5. Only **approved** expenses reduce accountability. Pending and rejected expenses are ignored.
6. Expected handover = Cash collected − Approved expenses. Difference = Actual − Expected.
7. Submitting a handover locks the rider's day. Management confirming receipt closes it. Management may instead *return* a submitted handover, which unlocks the day for the rider to fix.
8. Management cannot confirm a day that still has pending expenses.
9. After a day is closed, changes go through correction requests that management approves or rejects. Admin edits to closed days require a reason. Both paths recalculate the closeout and are audited.
10. Each delivery stores the fee used when it was recorded, so changing the default fee never changes history.
11. Riders with history are deactivated, not deleted. Deactivation blocks login and ends existing sessions immediately.

Suspicious entries are flagged, not silently accepted: collected more than the fee, a delivered order with zero financials, a fee different from the standard fee, and money collected on a failed or cancelled delivery.

## API overview

All routes are under `/api`. Every route except login and health requires `Authorization: Bearer <token>`. Money values are integer cents.

| Method & path | Role | Purpose |
|---|---|---|
| `POST /auth/login` | public (rate-limited) | Log in with email or username + password → `{ token, user }` |
| `GET /auth/me` · `POST /auth/change-password` | any | Current session / change password |
| `GET /config` · `PUT /settings` | any / admin | App settings (company, currency, fee override, receipt rule) |
| `GET /fees` · `POST /fees` | admin | Fee history / set a new default fee |
| `GET /dashboard` | admin | KPIs, trend, payment breakdown, rider comparison (filterable) |
| `GET /dashboard/rider` | rider | Today's summary for the logged-in rider |
| `GET /deliveries` | any (riders scoped) | List + filters + summary totals |
| `POST /deliveries` | any | Create (ID, date, time and rider set automatically; `clientRef` makes offline sync idempotent) |
| `GET /deliveries/:id` | any (scoped) | Detail, flags, lock state, history, corrections |
| `PATCH /deliveries/:id` | any (scoped) | Edit (riders: open days only; admins: reason required on closed days) |
| `POST /deliveries/:id/correction-request` | any (scoped) | Request a change to a closed record |
| `GET/POST /expenses` · `GET/PATCH /expenses/:id` | any (scoped) | List / submit (multipart, `receipt` file) / edit pending |
| `GET /expenses/:id/receipt` | any (scoped) | Stream the receipt file |
| `PATCH /expenses/:id/approve` · `/reject` | admin | Review expense (rejection requires a reason) |
| `POST /expenses/:id/correction-request` | any (scoped) | Correction for an expense on a closed day |
| `GET /closeouts/preview` | any (scoped) | Live server figures for a rider-day |
| `GET /closeouts` · `POST /closeouts` · `GET /closeouts/:id` | any (scoped) | List / submit handover / detail |
| `POST /closeouts/:id/confirm` · `/return` | admin | Confirm receipt (closes the day) / send back to the rider |
| `GET /corrections` · `POST /corrections/:id/approve` · `/reject` | any / admin | Correction requests |
| `GET/POST /riders` · `GET/PATCH/DELETE /riders/:id` | admin | Rider management (DELETE refused if the rider has history) |
| `POST /riders/:id/reset-password` · `/assign-bike` | admin | Account actions |
| `GET /riders/:id/performance` · `/activity` | admin | Performance figures / audit activity |
| `GET /bikes` · `POST /bikes` · `PATCH /bikes/:id` | any / admin | Fleet |
| `GET /reports/types` · `GET /reports?type=…` | admin | Report catalogue / report data |
| `GET /reports/export/excel` · `/export/pdf` | admin | File exports (same query parameters) |
| `GET /audit-logs` | admin | Read-only audit trail |

Common filter query parameters: `from`, `to` (YYYY-MM-DD), `rider`, `bike`, `status`, `paymentMethod`, `search`, `customer`, `page`, `limit`.

---

## Intentionally limited in this version

- **Offline:** new deliveries can be recorded offline and synced later. Expenses, handovers and edits need a connection, and the app says so rather than pretending otherwise. The app shell is cached by the service worker, but API data is never served from cache.
- **Receipts:** the local disk provider is included. Cloud providers plug into the storage interface.
- **Currency:** single currency (symbol configurable in Settings). No multi-currency conversion.
- **Roles:** Admin and Rider only. A read-only "supervisor" role would slot into the existing policy module.
- Future modules (GPS tracking, customer accounts, SMS/WhatsApp, Mobile Money integration, invoicing, commissions, fleet maintenance) are not built, but the data model (rider/bike/delivery references, flags, storage and policy abstractions) leaves room for them.
