# BATTLE HOUSE — Backend Wiring (dev quick reference)
Build: BH-VOTE-0801-D3 · Full spec: docs/Dev_Handoff_Spec.docx (Section 5 is authoritative)

## Golden rules
1. **Do not redesign the UI.** Replace storage, keep behavior identical.
2. **Server-authoritative balances.** The client never computes tokens in prod.
3. **Stamps are law.** Bump the build stamp on every artifact.

## Where to cut (searchable function names in app/index.html)
| Domain | Functions | Replace with |
|---|---|---|
| Session | `gateGo()`, footer key prompts | `POST /auth/otp/start` → `/check` → JWT (role claim) |
| Balance read | `renderVote()`, `refreshVoteButtons()`, `openProfile()` | `GET /me/balance`, `GET /contestants` (+WS) |
| Spend | `spendVotes()`, `castVote()`, `cardVote()`, vsFree path | `POST /votes {contestant_id, amount, source}` |
| Daily claim | `claimDaily()` | `POST /claims/daily` → `{granted, streak, bonus}` |
| Token packs | `buyPack()`, `cashConfirm()` | `POST /checkout` → Stripe session → webhook credits |
| Card mint | `collectCard()` | `POST /cards/mint` (server enforces mint window + atomic edition) |
| Drops | `mintDrop()` (admin), claim path | `POST /admin/drops`, `POST /drops/{id}/claim` |
| Card video | `recCard()` blob | `GET /uploads/presign` → PUT R2 → `POST /cards/{id}/video` |
| Perks | `perkOrder()`, `adPerkQueue` | `POST /perk-orders` → Checkout → webhook `PAID` → `PATCH DONE_ON_AIR` |
| Live ops | all writes in `buildAdmin()` | `/admin/*` CRUD |
| Registration | `regGo()` | `POST /contestants/register {invite_code,...}` |

## Realtime events (one WS room per show)
`vote.cast{contestant_id,new_total}` · `balance.updated` · `drop.claimed` · `poll.updated` · `feed.posted` · `stream.twin`
Fallback: poll `GET /contestants` every 10s.

## Data model (see 5.9 in docx for full DDL)
users · balances · transactions(immutable) · contestants · votes(+tally view) · cards(editions) · drops · perks/perk_orders · feed/polls · daily_claims(UNIQUE user,day)

## Cutover
`STORAGE_MODE = local | api` flag → ApiStore with the same `get/set` surface → flip per-feature (balance first, cards last). One-time local-history import endpoint for goodwill credit.

## Tokens terminology
When counsel confirms: VOTES(unit) → TOKENS everywhere money is involved; the verb "VOTE" stays. Map in docx §6. Guardrails (no cash-out, free daily path, 18+, fan prizes free-to-enter) are NON-NEGOTIABLE regardless of naming.

## Stack (recommended)
CF Workers (Hono/TS) · D1 or Neon Postgres · Durable Objects WS · R2 · Twilio Verify → JWT · Stripe Checkout+webhooks · Resend. Contract is stack-agnostic — don't change it, update the doc first if you must.

---
## ADDENDUM (Build D10) — Streaming architecture
The platform does NOT host video. One realtime camera push → social platforms → official embeds on-site.

**House page** (`s-live`, nav crest): `setHouse(pf)` toggles TIKTOK / YOUTUBE LIVE / KICK.
- TikTok → official creator embed (`ttCreatorEmbed()`: blockquote + tiktok embed.js) — renders reliably; ↗ chip opens the live natively.
- Kick → `player.kick.com/{channel}` iframe — true in-page live playback.
- YouTube → `youtube.com/embed/live_stream?channel=UC...` — **requires channel ID in `HOUSE_STREAMS`** (handle @battlehouselive known; ID pending from client).
- Unconfigured/blocked → branded CONNECTING (2.6s reveal) or OFFLINE card + FOLLOW chip. Never a raw dead frame.

**Contestant pages**: same three buttons under a 16:9 player (`setPfStream(pf)`), sourced from `c.soc {tt, yt, tw}` (**`tw` key = KICK**, label-only rebrand for stored-data compat). TikTok is the default/main feed. `c.liveOn` (admin STREAM TWIN) puts a pulsing **● LIVE** badge on that platform's button (`'twitch'` value maps to the KICK button).

**Backend jobs here**: persist `soc` handles from registration; drive `liveOn` from admin (or later, platform live-status polling); production TikTok LIVE embed via TikTok's official LIVE embed program (M-milestone errand). Also apply the containment pattern (columns carry max-width:100% / min-width:0 guards) to any new components.

---
## SCALE ADDENDUM — 50,000 CONCURRENT VOTERS (binding requirements)
Target: 50K concurrent · burst 2–5K votes/sec at elimination moments. Naive per-vote DB writes + per-vote WS broadcasts WILL fail at this level. These three patterns are REQUIRED, not suggestions:

### 1. Buffered vote ingestion (never 1 vote = 1 DB write)
API accepts vote → validates JWT + balance in Redis/DO memory → increments in-memory counters → **flush batches to Postgres every 250–500ms** (single multi-row insert + tally UPSERT). Ledger stays complete; the DB sees ~4 writes/sec of batches instead of 5K/sec of rows. Balance debits: Redis DECR (atomic) with periodic reconciliation to the transactions table.

### 2. Tiered fanout (never broadcast per-vote)
Broadcast **aggregated tallies on a 1–2s tick**, not individual events. 50K WebSocket connections: either (a) sharded rooms — 50–100 shards, each shard node/DO holds ≤1K sockets, tick fans out through shards; or (b) a pub/sub edge service (Cloudflare Pub/Sub, Ably) and keep the API stateless. A single Durable Object CANNOT hold 50K sockets — shard or delegate.
Read path for non-socket clients: `GET /contestants` served from edge cache, `Cache-Control: max-age=2`. The CDN absorbs millions of reads.

### 3. Admission control
Per-user rate limit (e.g. 10 votes/sec), per-IP burst caps at the edge (Cloudflare WAF rules), idempotency keys on purchase webhooks, and a static "heavy traffic" queue page ready to toggle. Load shedding is a feature, not a failure.

### Sizing reality check (why this is affordable)
- Static app: Cloudflare CDN → effectively infinite loads, ~$0.
- WS tier: 50K idle-ish sockets ≈ ONE 8–16 core node (uWebSockets/Go) or ~64 sharded DOs. Hetzner dedicated (AX42-class, ~€50–100/mo) laughs at this.
- Postgres: batched writes = a few hundred rows/sec sustained → single NVMe Hetzner box with a replica. 
- Total serious-launch infra: **€150–300/mo on Hetzner + free-tier Cloudflare** — vs 10–20x that on hyperscalers.

### Revised M6 acceptance (supersedes earlier 10K figure)
- Load test: **50K concurrent WS + 3K votes/sec for 10 sustained minutes**; p95 vote-ack < 400ms; tally tick ≤ 2s behind truth; zero ledger gaps (batch totals reconcile to per-vote ledger exactly).
- Chaos drill: kill one WS shard mid-test → clients reconnect within 10s, no double-spend.
- The demo file's behavior remains the UX contract at all loads.

---
## AUTH ADDENDUM — Social login (owner decision)
Primary identity = **OAuth: Google, TikTok (Login Kit), Kick (OAuth 2.1)** — replaces phone-first login from §5.1. Requirements:
1. **TikTok login MUST capture the user handle** and store it as the account's verified `tiktok_handle` — this powers stream sync, creator attribution, and share tracking. Apply for TikTok Login Kit early (app review takes time). Kick OAuth is newest — implement defensively, treat as optional third.
2. **Phone is NOT optional to the business — collect it progressively.** After OAuth, prompt for mobile + Twilio Verify OTP at the first high-intent moment (first token purchase attempt, or "get live vote alerts"). Verified phone stored with consent timestamp = the A2P marketing list. An account may exist without a phone; it may not PURCHASE without one (also serves 18+/fraud posture).
3. Account linking: one user, multiple providers — key on verified email where available; provider IDs stored in an `identities` table (user_id, provider, provider_uid, handle). Never create duplicate users for the same email.
4. JWT/roles model unchanged. If a native iOS app ever ships, Sign in with Apple becomes mandatory alongside social logins — plan the identities table for it now.
5. The existing landing lead-capture on battlehouselive.com stays as-is (separate system); on app launch, match app signups to the VIP list by email/phone to honor early-access ordering.

---
## LATE NIGHT FEED ADDENDUM (Build D13) — fan-controlled after-hours mode
King-of-the-hill over the Big Screen. Admin toggles mode; fans spend votes on PTZ cams.
**Mechanics (client demo implements fully, local):** 15-min rounds (config) — each cam has VOTE (+10pts, costs 10) and SABOTAGE (−10pts to target, costs 15, floor 0). Round end → highest cam is crowned to the Big Screen with a 5-min reign (config). During reign: ADD TIME (+30s, costs 10) / SABOTAGE CLOCK (−20s, costs 15). Reign expiry → production main feed until next round crowns. All spends hit the ledger ('LN' tag) via a dedicated wallet debit (lnSpend — deliberately does NOT credit contestant tallies).
**Functions:** lnState/lnSave · lnToggle · lnAct(i,dir) · lnClock(dir) · lnCrownNow · lnTick (1s) · renderLN. Admin module: start/end, round/reign minutes, force-crown, reset.
**Backend:** state machine in one authoritative object (Durable Object fits perfectly): {on, round_end, scores{}, king, reign_end}. Endpoints: POST /latenight/act {cam,dir} · POST /latenight/clock {dir} · admin POST /latenight/{start|end|config|crown|reset}. WS events: ln.score, ln.crown, ln.clock, ln.state. Same batching rules as votes (Scale Addendum). PTZ cam video = per-room stream URLs (Cloudflare Stream/WebRTC) — demo uses placeholder loops; wire real PTZ RTSP→WHEP in M4+. Anti-abuse: per-user rate caps, sabotage spend cap per round (suggest 10x vote cost), clock floor 0:30 and reign hard-cap 15:00 server-side.

---
## TOKENS IMPLEMENTED (Build D16)
UI now sells TOKENS (closed-loop, 1 TOKEN = 1 VOTE) per Section 6 of the spec. VOTES remains the verb/tally everywhere; TOKENS is the purchasable/spendable unit (packs, gifts, cards, Late Night, wallet pill). Backend: name the currency column tokens; keep vote tallies separate. Guardrails in §6 remain non-negotiable (no fan cash-out, free daily path, 18+, immutable ledger).

---
## LAUNCH ONBOARDING ADDENDUM — "Your pass is your key" (owner-approved concept)
Provision accounts for the VIP waitlist before public launch; their digital pass becomes a magic-link login.

**Flow:**
1. Import `leads.csv` (owner supplies final snapshot) → users table: {email, phone(+consent_ts), name, vip_no}. No passwords are ever created.
2. Generate per-user signed entry token (JWT: user_id, vip_no, single-use jti, 30-day exp; server can rotate/revoke).
3. Launch email (from vip@battlehouselive.com, existing consent covers it): reissued digital pass — same card design — whose QR + button link to `https://<app>/enter?t=<token>`.
4. `POST /auth/magic {t}` → validate + burn jti → session JWT → land them in the app with name + VIP # already on the fan profile. Prompt (not force) OAuth/phone linking per Auth Addendum; same-email OAuth later merges via identities table.
5. **Staged cohorts by vip_no** (e.g., #1–1000 hour one, then waves): marketing hype + built-in load ramp for the 50K scale plan. Cohort gates enforced server-side.
6. Optional (recommend): seed each pass with a small founder token grant (e.g., 25 ⬡) so first session includes a first vote.

**Security requirements:** tokens signed + single-use; entry endpoint rate-limited; unclaimed tokens expire and are re-issuable from admin; display-only pass.html (unsigned) remains for pre-launch — launch passes are the signed variant. Log claim events (audit).
**Deliverable additions:** import script (csv→users), token mint batch job, /auth/magic endpoint, cohort config in admin, reissued pass email template.
