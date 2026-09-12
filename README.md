# Pexli Airdrop Platform (`drop.pex.li`)

A points-based airdrop / quest platform for the **Pexli** EVM chain. Users
connect social + wallet accounts, complete on-chain and social quests, and earn
points that later convert to a mainnet **PEX** reward. An admin panel manages
tasks, points, content, users, and per-task on/off toggles.

Built to the master spec in `pexli-airdrop-build-prompt.md`. Core design rules:

- **No media stored** — only text, numbers, and timestamps. Firestore docs are
  kept tiny.
- **All verification & point-awarding is server-side** (Cloud Functions). The
  browser only *requests*; the server verifies and writes. Firestore rules deny
  every client write to points/ledger/config.
- **Every task type is toggleable** from the admin panel — no redeploy.

---

## Repository layout

```
/web          Vite + React SPA (Cloudflare Pages) — the user & admin UI
/functions    Firebase Cloud Functions (Node 20) — all verification + points
firebase.json, firestore.rules, firestore.indexes.json
```

### Backend modules (`/functions/src`)
| File | Responsibility |
| --- | --- |
| `init.js` | Admin SDK singleton |
| `params.js` | All owner-supplied params & secrets (`<<FILL_IN>>` values) |
| `config.js` | `config/global` defaults + reader |
| `util.js` | URL normalize, hashing, reachability, time helpers |
| `points.js` | **`awardPoints`** — the one transactional point writer (idempotent) |
| `chain.js` | ethers RPC + explorer queries for on-chain checks |
| `profile.js` | user create trigger, wallet save (unique), `getMe` |
| `tasks/onchain.js` | faucet / swap / tx verification (cursors + locks) |
| `tasks/links.js` | Medium/YouTube/TikTok/IG/review submission + dedupe |
| `tasks/x.js` | X OAuth2 PKCE, follow-check, tweet pool + verification |
| `admin.js` | config edit, tweet upload, moderation, users, CSV, bootstrap |
| `scheduled.js` | cron cleanup of stale tweet assignments |

---

## Referral system

Every user gets a stable 8-char **referral code** (deterministic from their uid)
and a share link `https://drop.pex.li/?ref=CODE`.

- A visitor arriving with `?ref=CODE` has it captured to `localStorage`; after
  they sign in, `setReferrer` binds them to the referrer **once** (no
  self-referral, set-once, code must exist).
- Whenever a referred user earns points, the referrer automatically earns
  **`config.referral.percent`%** of that award. The bonus is written in the
  **same transaction** off the same unique source id, so it's exactly-once —
  it also fires when an admin approves a pending submission.
- `referral` bonuses never chain (a referral row never triggers another).
- Admin can toggle referrals on/off and change the percent live (default 10%).

Referral state on the user doc: `referralCode`, `referredBy`, `referralCount`,
`referralPointsEarned`. Reverse lookup lives in `referralCodes/{code} → uid`.

## Branding

Uses the owner-supplied `web/public/LogoWhite.svg` (header, hero, login) on the
dark theme; `LogoBlack.svg` is available for any light surface.

## Anti-abuse (spec §7) — how it's enforced

- **Idempotent awards**: `pointsLedger` doc id = `sha256(taskType:refId)`, created
  inside a transaction. The same tweet id / tx hash / link can never pay twice,
  even on a double-clicked Verify.
- **Duplicate links**: `submittedLinks/{sha256(normalizedUrl)}` is reserved with
  `create()` (atomic) before any award — a URL can be claimed once, ever.
- **One wallet / one X per user**: `walletIndex/{addr}` and `xIndex/{xUserId}`
  lock docs enforced in a transaction.
- **Time locks & cursors**: `lastFaucetAt`/`lastSwapAt`/`lastTxAt`/`lastTweetTaskAt`
  + `lastCheckedBlock` / `txNonceCursor` mean repeat verifies inside a window
  return "still locked" cheaply and nothing is double-counted.
- **Rules**: clients read only their own doc + public config; all sensitive
  writes are functions-only.

---

## Setup

### 1. Firebase project (Blaze plan required — functions make outbound calls)
```bash
npm i -g firebase-tools
firebase login
cp .firebaserc.example .firebaserc     # put your project id in it
```
Enable **Authentication** (Google now; Apple later — needs a paid Apple
Developer account + Service ID), **Firestore**, **Functions**, **Cloud Scheduler**.

### 2. Configure params & secrets (the `<<FILL_IN>>` values)
Non-secret params (RPC, explorer, addresses, X client id) go in
`functions/.env` (see `functions/.env.example`). Secrets go in Secret Manager:
```bash
firebase functions:secrets:set X_CLIENT_SECRET
firebase functions:secrets:set ADMIN_BOOTSTRAP_TOKEN
```

### 3. Deploy backend
```bash
cd functions && npm install && cd ..
firebase deploy --only firestore:rules,firestore:indexes,functions
```

### 4. First admin
```bash
curl -X POST https://<region>-<project>.cloudfunctions.net/bootstrapAdmin \
  -H 'Content-Type: application/json' \
  -d '{"token":"<ADMIN_BOOTSTRAP_TOKEN>","email":"you@example.com"}'
```
Sign out/in; the admin panel appears in the header.

### 5. Frontend (Cloudflare Pages)
- `cp web/.env.example web/.env` and fill Firebase web config + chain URLs.
- Local dev: `cd web && npm install && npm run dev`.
- Cloudflare Pages: connect the repo, **build command** `npm run build`,
  **build output** `web/dist`, **root directory** `web`. Add the `VITE_*`
  environment variables. Point custom domain `drop.pex.li` at it.

### Local emulators
```bash
# functions/.env → set the params; then:
firebase emulators:start
# web/.env → VITE_USE_EMULATORS=true
```

---

## Owner MUST provide before launch (spec §11)
- [ ] Pexli **RPC URL** + **explorer API URL** (chainlist.org/chain/78901) →
      `PEXLI_RPC_URL`, `PEXLI_EXPLORER_API`, `VITE_PEXLI_*`
- [ ] **Faucet** dispenser address → `FAUCET_ADDRESS`
- [ ] **Lifelox DEX** router address → `DEX_ROUTER_ADDRESS`
- [ ] **X API** OAuth2 client id/secret + Pexli numeric user id (paid tier to read
      tweets/follows) → `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_PEXLI_USER_ID`
- [ ] **Apple** Service ID + key (for Apple sign-in) — configure in Firebase Auth
- [ ] **Logo** file → drop `pexli-logo.svg` in `web/public/` and swap the header mark
- [ ] Final point values / locks (defaults ship ready — edit live in admin)

## Honest caveats
- **X API is the expensive/fragile part** — reading tweets/follows needs a paid
  tier + rate limits. The `tweet` / `follow_x` tasks ship toggleable so they can
  be disabled if budget is tight; the rest of the site is unaffected.
- **Instagram follow** can't be auto-verified — it's manual/best-effort (admin
  awards it). The IG *post* link task is auto-checked like other links.
- The tx-per-hour check is nonce-based (RPC only); faucet & swap prefer the
  explorer API. If no explorer is configured, those two tasks return a clear
  "not configured" error rather than failing silently.
