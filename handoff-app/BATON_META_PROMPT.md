# BATON — Build Specification / Meta-Prompt

> **How to use this file.** Paste everything from `=== BEGIN PROMPT ===` to `=== END PROMPT ===`
> into Claude Sonnet in a fresh repo. Attach `roster.csv`. Build it in the numbered phases —
> do not ask Sonnet for all of it in one shot; give it Phase 0–2 first, verify, then Phase 3+.
>
> The name **Baton** appears in exactly one place below (`APP_NAME`). To rename, find-replace that
> one token and the tagline.

---

=== BEGIN PROMPT ===

## 0. Role and standing orders

You are a senior full-stack engineer building a production web app that ~420 real MBA students at
ISB Hyderabad will use daily on their phones. This is not a demo. Every decision must survive
contact with people who will use it once, get confused, and never come back.

Standing orders for the whole build:

1. **The database is the source of truth, not the UI.** Every state transition described in §4 must
   be enforced by Postgres constraints, triggers, or RPC functions — not only by React. If two people
   tap "Borrow" on the same item at the same second, the database must reject one of them.
2. **Mobile-first, always.** Design at 390px width. Desktop is a stretched mobile layout. Every
   primary action must be reachable with one thumb.
3. **No dead ends.** Every screen with zero results has a CTA. Every error names the fix.
4. **Do not invent scope.** If something is not in this spec, ask before building it.
5. **TypeScript strict mode on. No `any`. No `@ts-ignore`.**
6. After each phase, output: files created, migrations run, and a manual test checklist I can run
   in the browser.

---

## 1. Product definition

**APP_NAME: `Baton`**
**Tagline: "Kiske paas hai?"** ("Who has it?")

**One-line pitch:** Baton is the custody ledger for everything the ISB Class of 2027 lends each
other — speakers, chairs, cutlery, containers, books, extension cords, suitcases, iron boxes,
badminton racquets — so nobody ever has to ask three people to find out where their thing went.

**The single problem it solves:** at any moment, for any item, answer *"who is physically holding
this right now, and how did it get there?"* — with a trail both parties agreed to.

**The insight that shapes the whole design:** possession only changes when **both** people confirm.
A giver saying "I gave it" is a claim. A receiver saying "I got it" is a claim. Custody transfers
only when both claims exist. This is why the app is called Baton — in a relay, the baton only counts
as passed when both runners have made contact. Every feature below serves this.

**Explicit non-goals for v1:** payments, deposits held in escrow, rentals for money, marketplace
/ selling, chat (WhatsApp already exists), Android/iOS native apps.

---

## 2. Stack (fixed — do not substitute)

| Layer | Choice |
|---|---|
| Framework | Next.js 15, App Router, TypeScript strict, React Server Components |
| Styling | Tailwind CSS v4 + shadcn/ui |
| DB / Auth / Storage | Supabase (Postgres 15, Supabase Auth, Supabase Storage) |
| Forms & validation | react-hook-form + Zod (one Zod schema per entity, shared client+server) |
| Mutations | Next.js Server Actions only. No API routes except webhooks and OG image generation. |
| Transactional email | Resend |
| Images | `browser-image-compression` client-side → Supabase Storage → `next/image` |
| Dates | `date-fns` (never raw `Date` math) |
| Deploy | Vercel |
| PWA | `next-pwa` or a hand-rolled manifest + service worker — installable to home screen |

Package manager: `pnpm`. Node 20+.

---

## 3. Identity, auth, and the address system

### 3.1 The roster is the gate

`roster.csv` (attached) contains all 420 students: `sno, pgid, name, email, section, study_group`.
Sections A–F. 84 study groups (A1…F14). Every email is `<name>_pgp2027@isb.edu` and unique.
Every PGID is unique.

Seed this into a `roster` table on first migration. **Nobody who is not in `roster` can create an
account.** This is the entire anti-abuse strategy and it is sufficient — it is a closed cohort.

### 3.2 Auth decision — and why

ISB runs on Microsoft 365 / Outlook, so:

**Primary: Supabase `azure` provider (Microsoft Entra ID), tenant-restricted to ISB.**
One tap, no password, no SMS cost, and identity is guaranteed real because the person already holds
the `@isb.edu` mailbox. On callback: verify `email` ends in `@isb.edu` **and** exists in `roster`;
if not, sign them out with a clear message. Auto-populate name/PGID/section/study group from the
roster row — the user never types them.

**Fallback (build this too, behind a feature flag): Supabase email OTP / magic link** restricted to
`@isb.edu`. Use this if ISB's Entra tenant admin blocks third-party app registration — which is a
real possibility you should test on day one before writing any UI.

**Do NOT build phone-number OTP.** In India, sending transactional SMS requires TRAI DLT registration
of the sender entity, header, and template through an operator portal — weeks of paperwork plus a
paid provider (Twilio/MSG91) charged per message. It buys nothing here, because `@isb.edu` is a
*stronger* identity signal than a phone number for this cohort. Phone number is collected as an
optional *profile field* for WhatsApp deep-links only — never as a login credential.

### 3.3 "Login once and be done"

This is a hard requirement. Implement all of:

- Supabase session with refresh-token rotation; set JWT expiry long (project setting) and refresh
  silently in a root-level client provider.
- Persist the session in cookies via `@supabase/ssr` so RSC and Server Actions see it.
- Ship a PWA manifest + `apple-touch-icon` and a soft "Add to Home Screen" prompt after the user's
  second successful action. Installed PWA + long refresh token = they log in once per device and
  never again in the academic year.
- Never force re-auth on a 401 mid-action. Refresh, retry once, and only then bounce to login —
  returning the user to exactly the page and action they were on (`?next=` param).

### 3.4 The address system (SV / Block / Quad)

Canonical display format: **`SV3 C01`**

Validation: `^SV[1-3] [A-J](0[1-9]|1[0-9]|2[0-4])$`

Store as **three normalized columns**, not one string — you need to query "who in my block has a
speaker":

```
sv    smallint  CHECK (sv BETWEEN 1 AND 3)
block char(1)   CHECK (block BETWEEN 'A' AND 'J')
quad  smallint  CHECK (quad BETWEEN 1 AND 24)
```

Plus a generated column for display:
```sql
address_display text GENERATED ALWAYS AS ('SV' || sv || ' ' || block || lpad(quad::text,2,'0')) STORED
```

**Input UI: three tap-selectors, never a free-text box.** SV: 3 buttons. Block: 10 buttons.
Quad: a 24-cell grid. Typing "sv3-c1" or "SV 3 C 1" must be impossible, so normalization bugs
cannot exist. Accept a pasted string in the URL/share flow by parsing it leniently, then snapping
it to the three selectors for confirmation.

Address is set once at onboarding, editable from profile. Store `address_updated_at`.

**Proximity is a first-class sort key.** Rank search results by: same block → same SV → other SV.
The whole value of borrowing is that the thing is 40 metres away.

---

## 4. The domain model — this is the heart of the app

### 4.1 Items

An **item** belongs to exactly one **owner** (the person who bought it and will get it back forever).

```
items
  id uuid pk
  owner_id            uuid -> profiles
  title               text        -- "JBL Flip 6 speaker"
  category            enum        -- see below
  description         text
  photo_urls          text[]      -- 1..4, first is the cover, at least 1 REQUIRED
  estimated_value_inr integer     -- required, drives the trust tier
  condition           enum        -- NEW | GOOD | WORN | BEAT_UP
  quantity            integer default 1   -- 6 chairs, 20 plates
  borrow_policy       enum        -- OPEN | OWNER_APPROVAL
  sublend_policy      enum        -- FORBIDDEN | OWNER_APPROVAL | ALLOWED
  visibility          enum        -- COHORT | MY_SECTION | MY_SV | MY_BLOCK
  max_loan_days       integer     -- default 7, nullable = no limit
  status              enum        -- AVAILABLE | ON_LOAN | UNAVAILABLE | LOST | RETIRED
  current_holder_id   uuid -> profiles   -- DENORMALIZED CACHE, see 4.4
  share_slug          text unique -- short, URL-safe, e.g. "b7k2mq"
  created_at, updated_at
```

Categories (seed exactly these, plus `OTHER`): `AUDIO`, `FURNITURE`, `KITCHEN_COOKWARE`,
`KITCHEN_CUTLERY_CROCKERY`, `BOOKS_ACADEMIC`, `BOOKS_LEISURE`, `ELECTRONICS_CHARGERS`,
`APPLIANCES` (iron, kettle, induction), `SPORTS`, `LUGGAGE`, `FORMAL_WEAR`, `TOOLS_HARDWARE`,
`PARTY_EVENT` (lights, decor, coolers), `STATIONERY`, `OTHER`.

**Auto-tier by value** — this is the guardrail that stops people losing expensive things:
`estimated_value_inr` ≥ 5000 forces `borrow_policy = OWNER_APPROVAL` and
`sublend_policy = OWNER_APPROVAL` as the *default* on the create form (user can override downward,
with a confirmation dialog that says what they're giving up).

### 4.2 The two orthogonal policies — read this carefully

These are different questions and most implementations conflate them. Do not.

- **`borrow_policy`** answers: *can a person take this from the owner without asking?*
  - `OPEN` — request is auto-approved. Still requires the physical two-tap handoff (§4.3).
  - `OWNER_APPROVAL` — owner must tap Approve before a handoff can start.

- **`sublend_policy`** answers: *when B is holding the owner's item and C asks B for it, what happens?*
  - `FORBIDDEN` — C cannot request from B at all. The item must return to A first. UI shows
    "Ask [Owner] — this one comes back home between borrows."
  - `OWNER_APPROVAL` — **the case you specifically care about.** C requests → **both** B (current
    holder) and A (owner) must approve → then the B→C handoff proceeds. Two approvals, one
    handoff. The owner is notified with full chain context: "Aditya has your JBL speaker. Priya
    (SV2 F14) wants it until Sat 6 Sep. Approve the pass?"
  - `ALLOWED` — only B approves; A is notified but has no veto. A can always tap **Recall** (§4.6).

Chain depth: cap at **4 hops** from the owner. Beyond that, force a return to the owner. This is not
arbitrary — a longer chain is how things get lost, and the cap is the product's opinion.

### 4.3 The handoff state machine — the core mechanic

Every custody change is a row in `handoffs`. States:

```
REQUESTED
   ├─ (borrow_policy=OPEN and not a sublend) ──auto──> APPROVED
   ├─ APPROVED        (all required approvers said yes)
   ├─ DECLINED        (terminal)
   ├─ CANCELLED       (requester withdrew, terminal)
   └─ EXPIRED         (no approval in 48h, terminal)

APPROVED
   └─ HANDED_OVER     (the GIVER taps "I've handed it over" + reveals a 4-digit code)

HANDED_OVER
   ├─ RECEIVED        (the RECEIVER enters the 4-digit code)  <<< CUSTODY MOVES HERE
   ├─ DISPUTED        (receiver taps "I never got this")
   └─ AUTO_RECEIVED   (48h elapsed with reminders; custody moves but is flagged unconfirmed)
```

And the mirror-image return leg, which is a `handoffs` row with `kind = 'RETURN'` from holder back
to owner (or back up one link in the chain):

```
RETURN_INITIATED  (holder taps "I've returned it" + code)
   ├─ RETURN_CONFIRMED  (owner enters code)  <<< custody moves back, loan closes
   ├─ DISPUTED
   └─ AUTO_RETURN_CONFIRMED (48h + reminders, flagged unconfirmed)
```

**Non-negotiable rules, enforced in the database:**

1. `items.current_holder_id` changes **only** via the trigger that fires on transition into
   `RECEIVED` / `AUTO_RECEIVED` / `RETURN_CONFIRMED` / `AUTO_RETURN_CONFIRMED`. No other code path
   writes that column. Ever.
2. A partial unique index guarantees at most one live handoff per item at a time:
   ```sql
   CREATE UNIQUE INDEX one_live_handoff_per_item
     ON handoffs(item_id)
     WHERE state IN ('REQUESTED','APPROVED','HANDED_OVER','RETURN_INITIATED');
   ```
   (For `quantity > 1` items, model each unit as an `item_unit` row and key the index on
   `item_unit_id` instead. Do this from the start — retrofitting it is painful.)
3. The 4-digit code is generated on `APPROVED`, stored hashed, shown only to the giver, and
   compared server-side. It is proof the two people were physically in the same place. Provide a
   "can't scan/type — confirm manually" escape that requires the *receiver* to tap in their own
   session, which is still two-party.
4. The **auto-confirm after 48h** is mandatory. Without it a single unresponsive person deadlocks
   the ledger forever and the app dies. Auto-confirmed events are visibly flagged
   `confirmed_by = 'SYSTEM'` in the trail.
5. State transitions are implemented as a single Postgres function
   `advance_handoff(handoff_id, action, actor_id, code)` returning the new state, with a
   `CHECK`-enforced transition table. Server Actions call this RPC. The React layer never
   constructs a state string.

### 4.4 The custody ledger

```
custody_events   -- APPEND ONLY. No updates, no deletes. Revoke those grants in RLS.
  id, item_id, from_user_id (null = owner origin), to_user_id,
  handoff_id, event_type, confirmed_by ('BOTH'|'SYSTEM'|'ADMIN'), occurred_at, note
```

`items.current_holder_id` is a cache derived from this table. Write a
`SELECT verify_custody_integrity()` function that recomputes every item's holder from the ledger and
returns mismatches. Run it in a test. If the cache and the ledger disagree, the ledger wins.

The item page renders the full chain as a vertical timeline:
`Abhishek (owner) → Aditya, 12 Aug → Priya, 19 Aug → **with Priya now, 9 days**`.
This one screen is the entire reason the app exists. Make it the best-looking thing in the product.

### 4.5 Loans, due dates, overdue

Every approved handoff carries `due_at`. Default `now() + items.max_loan_days`. Borrower can request
a different date; owner sees it in the approval card.

States surfaced to the user: `Due in 5 days` / `Due tomorrow` / **`Overdue by 3 days`** (red).

Notifications: T-1 day, on due date, +1 day, +3 days, +7 days, then weekly. To **both** parties —
the owner needs to know as much as the borrower.

**Nudge button** on any overdue loan: sends an in-app + email notification, and opens a WhatsApp
deep-link (`https://wa.me/91XXXXXXXXXX?text=...`) with a pre-filled polite message including the
item name, the days overdue, and the Baton link. Do **not** attempt the WhatsApp Business API —
it requires Meta business verification you will not get.

### 4.6 Owner powers

- **Recall** — owner can demand return at any time from anyone in the chain, regardless of due date
  or policy. Creates a `RETURN` handoff, notifies everyone in the chain. Non-overridable.
- **Mark lost / damaged** — opens a `disputes` row, freezes the item, records `estimated_value_inr`
  as the reference amount. Baton does not settle money; it records the fact and links out. (If you
  later ship a Hisaab integration, this is the hook — leave `dispute.settlement_ref` nullable.)
- **Retire** — item leaves circulation, ledger is preserved.

### 4.7 Trust score

Per profile, computed nightly (or on write — your call, but it must be cheap):

```
loans_completed, on_time_returns, late_returns, avg_days_late,
items_owned, items_currently_held, unconfirmed_handoffs, open_disputes
```

Surface as a simple badge on every avatar: **Reliable** (≥5 loans, ≥90% on time) /
**New** (<3 loans) / **Slow returner** (≥2 returns >3 days late) / **⚠ Has open dispute**.

Be honest in the copy. A softened label defeats the purpose — the score exists so owners can decide
whether to lend, and a score that never says anything negative is decoration.

### 4.8 Wanted posts (the demand side)

Half the value is the reverse direction: "does anyone have an extension board for tonight?"

```
wanted_posts: requester_id, title, category, needed_from, needed_until, note, status, share_slug
```
Anyone can **Offer** an item they own against it (or offer something not yet in Baton, which opens
the create-item flow pre-filled). Accepting an offer creates a normal handoff. Auto-expire after
`needed_until`.

---

## 5. Shareable links — build this properly, it is the growth mechanism

Nobody installs an app because it exists. They open a link a friend dropped in a WhatsApp group.

- **Public routes, no auth required to view:**
  - `/i/[slug]` — item page: photo, title, owner name + address, availability, current holder,
    trust badge. **The custody chain is hidden from logged-out viewers** (privacy), replaced with
    "Available" or "Currently with a Co'27 student".
  - `/w/[slug]` — wanted post.
  - `/u/[pgid]` — a person's public shelf: what they own and are willing to lend.
- **Every action button on a public page** (`Borrow`, `Offer`, `Message`) routes to
  `/login?next=<current-url>&intent=borrow`. After the one-tap Microsoft sign-in, the user lands
  back on the exact page with the borrow sheet already open. Zero re-navigation.
- **Dynamic OG images** via `next/og` at `/i/[slug]/opengraph-image`: the item photo, the title,
  the value, and a status pill. This is what renders in the WhatsApp preview and it is the single
  highest-leverage 40 lines of code in the app. Test it in the WhatsApp desktop client before
  calling it done.
- **Share sheet** on every item: native `navigator.share()` where available, plus explicit
  "Copy link" and "Share on WhatsApp" buttons with pre-written text:
  `"JBL Flip 6 — free to borrow till Sunday. Grab it on Baton: <link>"`
- **Invite link** `/join?ref=<pgid>` for onboarding classmates; credits the referrer on a simple
  leaderboard. Still gated by the roster check — the invite is a convenience, not an authorization.

---

## 6. Screens (build in this order)

1. **`/login`** — one button: "Continue with ISB email". Nothing else. No email field, no password
   field, no "sign up" link.
2. **`/onboarding`** — three steps: confirm your roster details (read-only) → set your address
   (SV/Block/Quad tap grid) → optional phone for WhatsApp nudges. Skippable phone, not skippable
   address.
3. **`/` (Home)** — search bar pinned at top; horizontal category chips; "Available near you"
   (same block first); "Your active loans" strip with due-date pills; "Wanted right now".
4. **`/add`** — camera-first. Photo → title → category → value → policy toggles → done. Target
   **under 40 seconds**. Value and photo are the only mandatory typed fields. Pre-fill category from
   the title with a simple keyword map.
5. **`/i/[slug]`** — item page + custody timeline + the primary action button (state-dependent:
   Borrow / Request / Confirm receipt / Return / Nudge).
6. **`/inbox`** — the action queue. Grouped: *Needs your approval* / *Needs your confirmation* /
   *Overdue*. This is where the two-party mechanic lives. Badge count in the tab bar.
7. **`/me`** — my items, my borrowings, my history, trust score, address, sign out.
8. **`/wanted`** — feed of wanted posts + create.
9. **`/admin`** — roster sync, force-resolve disputes, integrity check runner. Gate on an
   `is_admin` boolean, seeded manually.

Bottom tab bar, 5 tabs: Home · Wanted · **Add (center, raised)** · Inbox · Me.

---

## 7. Row Level Security — write these policies explicitly

RLS **on** for every table. Enumerate policies; do not rely on the service role in app code (use the
service role only in the seed script and cron jobs).

- `profiles`: everyone in the cohort reads name/section/study group/trust badge/address_display;
  only self writes; **phone number readable only by someone in an active handoff with you.**
- `items`: SELECT permitted if `visibility='COHORT'`, or the viewer matches the section/SV/block
  scope, or the viewer is the owner or current holder. INSERT/UPDATE/DELETE: owner only — except
  `current_holder_id`, which is revoked from all roles and written only by the trigger.
- `handoffs`: readable by requester, giver, receiver, and the item owner. Writable only through the
  `advance_handoff` RPC (`SECURITY DEFINER`, with the actor check inside).
- `custody_events`: SELECT for anyone who can see the item; **no INSERT/UPDATE/DELETE grants to
  `authenticated` at all** — trigger-only writes.
- `roster`: read-only to authenticated; writes to service role only.
- Storage bucket `item-photos`: public read, authenticated write, path-scoped to
  `{user_id}/{item_id}/{uuid}.webp`, 5 MB cap, MIME allowlist.

---

## 8. Nitty-gritties that will otherwise bite you

- **Image pipeline:** compress client-side to max 1600px / ~300KB WebP *before* upload. Students are
  on campus wifi and 4G with 12MP phone photos; a raw upload is a 10-second stall and they will
  abandon the create flow. Show a local `URL.createObjectURL` preview instantly, upload in the
  background, and let the form submit before the upload finishes (optimistic, with a retry queue).
- **Timezone:** everything `timestamptz`, stored UTC, rendered `Asia/Kolkata`. Due dates are dates
  in IST, not instants — a loan "due 6 Sep" means end of day 6 Sep IST. Get this wrong and every
  overdue badge is off by a day for half the day.
- **Optimistic UI with rollback:** `useOptimistic` for approve/confirm taps. If the RPC rejects
  (race lost, wrong code), roll back visibly and explain why — do not silently revert.
- **Idempotency:** the confirm-receipt action must be safe to fire twice (double-tap on a laggy
  connection). Key on handoff id + target state; a repeat transition into the same state is a no-op
  returning success, not an error.
- **Names collide.** There are duplicate first names in a 420-person cohort. Always render
  `Name · Section · SVx Yzz` in any disambiguating context (approval cards, search, chain timeline).
- **Search:** Postgres `pg_trgm` GIN index on `title || ' ' || description`. People will type
  "speker", "extention board", "cutlary". Trigram similarity handles this; plain `ILIKE` does not.
  Add a small synonym map for the top 30 campus items (`speaker`↔`jbl`↔`boombox`,
  `extension`↔`extension board`↔`power strip`↔`multiplug`, `iron`↔`iron box`↔`press`).
- **Empty state at launch is the real risk.** Day one there are zero items and the app looks dead.
  Ship a **"Seed your shelf"** onboarding step: a checklist of 20 common ISB items
  (speaker, extension board, iron, kettle, induction cooktop, suitcase, folding chair, yoga mat,
  badminton racquet, blazer, tripod, umbrella, cutlery set, casserole, hair dryer, board games,
  power bank, HDMI cable, clothes drying rack, first-aid kit) where each tap creates an item with
  category and a default policy pre-filled, needing only a photo and a value. Target: 8 items in
  90 seconds.
- **Rate limits:** max 20 item creations/day, 10 borrow requests/day per user. Simple counter table.
- **Cron:** a Vercel Cron (`/api/cron/tick`, secret-header protected) hitting hourly for: due-date
  notifications, 48h auto-confirm sweeps, request expiry, wanted-post expiry, trust recompute.
- **Analytics:** count items created, handoffs completed, median hours from `HANDED_OVER` to
  `RECEIVED`, and % auto-confirmed. That last number is the health metric — if it climbs above 25%,
  the two-party mechanic is failing and the ledger is fiction.
- **Accessibility:** 44px minimum tap targets, real `<button>` elements, visible focus rings,
  colour is never the only signal for overdue (add the word "Overdue").

---

## 9. Build phases — do these in order, stop after each

- **Phase 0 — Spike the risk.** Register the app in ISB's Microsoft Entra tenant and get one
  successful `@isb.edu` sign-in through Supabase. If tenant admin consent is blocked, switch to
  email OTP now, before anything else is built. **Do not skip this. Everything downstream assumes it.**
- **Phase 1 — Schema.** All migrations, RLS policies, the `advance_handoff` function, the custody
  trigger, the roster seed from `roster.csv`. Write pgTAP or plain SQL assertions for: double-borrow
  rejection, custody-moves-only-on-receive, chain-depth cap, sublend requiring both approvals.
- **Phase 2 — Auth + onboarding + profile + address picker.** End state: I can sign in and set
  `SV3 C01`.
- **Phase 3 — Items:** create (camera-first), browse, search, item page. No borrowing yet.
- **Phase 4 — The handoff engine:** request → approve → hand over (code) → receive → return.
  Both direct and sublend paths. This is the hardest phase; budget accordingly.
- **Phase 5 — Inbox, notifications, due dates, cron, nudges.**
- **Phase 6 — Public share pages, OG images, WhatsApp share, invite links.**
- **Phase 7 — Wanted posts, trust scores, disputes, admin.**
- **Phase 8 — PWA, polish, empty states, seed-your-shelf, Vercel deploy + cron config.**

## 10. Deliverables per phase

Files changed · migrations (as numbered SQL files in `supabase/migrations/`) · env vars added ·
a manual browser test checklist · anything in this spec you think is wrong, with your reasoning.

=== END PROMPT ===

---

## Appendix — what I'd watch after launch

| Metric | Healthy | What it means if it isn't |
|---|---|---|
| % handoffs auto-confirmed at 48h | < 15% | The two-tap mechanic is being ignored; the ledger is becoming fiction |
| Median hours HANDED_OVER → RECEIVED | < 2h | People aren't confirming in the moment; move the confirm prompt to a push |
| Items per active user | > 4 | The seed-your-shelf flow is failing |
| Chain depth > 1 as % of loans | > 20% | The sublend feature was worth building; below 5%, it wasn't |
| WoW active borrowers | flat is fine | This is a 420-person campus, not a growth startup — retention beats acquisition |
