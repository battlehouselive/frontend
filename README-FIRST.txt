BATTLE HOUSE LIVE - SEASON 1 VOTING ENGINE
DEVELOPER HANDOFF PACKAGE · BUILD BH-VOTE-0801-D10
==================================================
1. Open app/index.html (locally or any static host)
2. Access code: BHLive123!$?@
3. Explore with role keys: Admin=KEYMASTER · Contestant=HOUSEKEY ·
   Camwall=SHOWTIME · Register invites=BHS1-CAST / BHS1-VIP
4. READ docs/Dev_Handoff_Spec.docx COMPLETELY before writing code.
   Section 5 = backend wiring (the job). Section 6 = tokens/legal.
   Section 7 = milestones + acceptance criteria + working rules.
5. docs/BACKEND_WIRING.md = quick reference of the same wiring.
6. extras/verify-worker.js = Twilio Verify Cloudflare Worker (auth start).
RULES: UI is approved as-is (no redesign) · balances are server-authoritative ·
build stamps on everything · doc-first API changes.

STREAMING (D10): house page + contestant players embed TikTok (official
creator embed) / Kick (player.kick.com) / YouTube Live (needs UC channel ID
in HOUSE_STREAMS). LIVE badge on platform buttons from c.liveOn.
See docs/BACKEND_WIRING.md addendum.
