# Handoff — "Kiske paas hai?"

The custody ledger for everything ISB PGP Co'27 lends each other. Full product spec: see
`BATON_META_PROMPT.md` in this repo (yes, it still says "Baton" in a couple of places from the
naming pass before "Handoff" was picked — the app itself, `package.json`, and every screen are
already on **Handoff**; only that planning doc's title/copy is stale, cosmetic only).

## What's actually built right now (verified: `npm run typecheck` and `npm run build` both pass clean)

- **Full Postgres schema** — `supabase/migrations/0001`–`0007`. Roster gate, profiles, items +
  item_units (quantity-safe from day one), the full handoff state machine
  (`advance_handoff()` / `request_handoff()`), append-only custody ledger, RLS on every table,
  trust scores, rate limiting, storage policies.
- **Roster** — cleaned from your PDF: 420 students, 6 sections, 84 study groups, zero dupes.
  Seeded via `supabase/seed/seed-roster.ts` + `roster.json`.
- **Auth** — Microsoft/ISB-Outlook OAuth (feature-flagged until you confirm Entra works — see
  Phase 0 below) + email-OTP fallback. The fallback has the thing you asked for: type a
  name or PGID, pick yourself from the roster, and the magic link goes to your real
  `@isb.edu` address server-side — nobody types `abhishek_jain_pgp2027@isb.edu` by hand.
- **Onboarding** — confirm roster identity → SV/Block/Quad tap-picker (no free text, so the
  address format literally cannot be typo'd) → optional phone for WhatsApp nudges.
- **Public browse (`/`) + public item pages (`/i/[slug]`)** — this is "any person can check
  who has what," working logged out. Anonymous viewers see availability and a redacted
  location; signing in reveals the full name and exact block.
- **Add an item** — camera-first, photo compressed client-side before upload, name +
  category (auto-guessed from the title) + value + condition + policies. ₹5,000+ items are
  forced to owner-approval on both borrowing and passing-along, matching the DB-level guard.
- **PWA basics** — manifest, `apple-mobile-web-app-capable`, 16px inputs (stops iOS zoom-on-focus),
  44px tap targets, `dvh` units (avoids the iOS Safari 100vh bug), single-column mobile-first
  layout capped at `max-w-md` even on desktop.

## What's spec'd but not yet wired to a screen

The **borrow/approve/hand-over/confirm button on `/i/[slug]` is a disabled placeholder.** The
entire state machine it needs (`request_handoff`, `advance_handoff`, the 4-digit code, the
48-hour auto-confirm sweep) is done and tested-by-inspection in the SQL, but no UI calls it yet.
That's the next and most important phase — everything else is comparatively cosmetic. Also not
built: `/inbox` (the approval/confirmation queue), `/me`, `/wanted`, dynamic OG images, the
WhatsApp nudge deep-links, the hourly cron sweep route, and `/admin`. All of these are specified
in detail in `BATON_META_PROMPT.md` §6–§9 — hand that file plus this codebase to Sonnet and ask
for Phases 4 onward; it has everything it needs including which files already exist.

## Phase 0 — do this before anything else

Try registering an app in ISB's Microsoft Entra tenant and getting one real `@isb.edu`
sign-in through Supabase's `azure` provider (`supabase.com/docs/guides/auth/social-login/auth-azure`).
If ISB IT blocks third-party app registration or admin consent, you don't need to wait on
them — leave `NEXT_PUBLIC_AZURE_AUTH_ENABLED=false` and the app runs entirely on the email-OTP
fallback, which is already fully built and needs no tenant permissions at all.

## Setup

1. **Create a Supabase project** (supabase.com — free tier is plenty for 420 users).
2. **Run the migrations**, in order, in the Supabase SQL editor (or `supabase db push` if you use
   the CLI): `supabase/migrations/0001` → `0007`.
3. **Copy `.env.example` to `.env.local`** and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase → Settings → API.
   - `SUPABASE_SERVICE_ROLE_KEY` — same page. **Never commit this or expose it to the client.**
   - `NEXT_PUBLIC_SITE_URL` — `http://localhost:3000` for now, your Vercel URL once deployed.
4. **Seed the roster** — two ways, pick one:
   - No local setup: open `supabase/seed/roster_seed.sql` in the unzipped folder, copy the whole
     file, paste into the Supabase SQL Editor, click Run. 420 rows, safe to re-run.
   - If you have Node/npm set up locally: `npm run seed:roster` instead (reads `roster.json`,
     upserts via the service-role key).
5. **Configure email templates in Supabase** (Auth → Email Templates) so the magic-link email
   doesn't look like the Supabase default — at minimum rename the sender and subject.
6. Set up Azure OAuth once Phase 0 succeeds (Supabase → Auth → Providers → Azure), then flip
   `NEXT_PUBLIC_AZURE_AUTH_ENABLED=true`.
7. `npm install && npm run dev` — open `http://localhost:3000`.

## Deploying to Vercel

1. Push this repo to GitHub, import it into Vercel.
2. Add the same env vars from `.env.local` in Vercel's Project Settings → Environment Variables.
3. Set `NEXT_PUBLIC_SITE_URL` to your real `https://<something>.vercel.app` (or custom domain),
   and update it in Supabase's Auth → URL Configuration → Redirect URLs to match
   `https://<your-domain>/auth/callback`.
4. Deploy. The storage bucket, RLS policies, and roster gate all travel with the Supabase project,
   not with Vercel — nothing else to configure there.

## Manual test checklist for what's built

- [ ] Visit `/` while logged out — item grid renders (once you've added items), no auth prompt.
- [ ] Tap "Sign in" → land on `/login` → type a partial name → your roster row appears with a
      masked email → tap it → "Email a link" → check inbox → link signs you in.
- [ ] First login redirects to `/onboarding`, not `/`.
- [ ] Onboarding step 1 shows your real roster name/PGID/section — correct, unmodifiable.
- [ ] Address picker: tapping SV/Block/Quad updates the "SV3 C01"-style preview live; "Continue"
      is disabled until all three are picked.
- [ ] Finishing onboarding lands you back on whatever page you started from (test via a shared
      `/i/[slug]` link opened logged-out → sign in → you return to that exact item page).
- [ ] `/add`: photo required before submit; typing "speaker" auto-selects the Audio category;
      entering ₹6000 hides the borrow/sublend toggles and shows the owner-approval notice.
- [ ] After adding an item, `/i/[slug]` shows it correctly; open the same URL in an incognito
      window — confirm the holder's name/exact block are hidden, replaced with "A Co'27 student".
- [ ] `npm run typecheck` and `npm run build` both exit clean (already verified once during this
      build — re-run after any change).

## Stack

Next.js 15 (App Router, Server Actions) · TypeScript strict · Tailwind · Supabase (Postgres +
Auth + Storage) · Zod · react-hook-form (not yet wired into `/add`'s form — currently plain
controlled state; fine at this size, worth switching once forms multiply) · date-fns.
