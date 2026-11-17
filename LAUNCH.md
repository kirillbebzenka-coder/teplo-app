# TEPLO — Launch control room
Updated: 2026-11-17. Status: **DEMO ONLY — real dispatch and payment are NOT enabled**.

## Business objective
Build an operator-independent local logistics asset with minimal external investment. Founder runs first controlled pilot and documents each step; project reinvests **surplus after courier payments, taxes and operating obligations**.

## Product flows — never merge these at intake
1. **Buyer in TEPLO** → dispatcher calls every venue → records confirmation and ETA per venue → selects a slot → sends one multi-pickup job to courier queue. Unconfirmed buyer orders must never appear in courier queue.
2. **Venue: "Нужен курьер"** → the venue has already accepted its sale → enters contents, customer, ETA, pickup address and slot → courier queue without mandatory dispatcher confirmation.
Both use the same courier engine. Real orders remain locked until all release conditions are satisfied.

## Release blockers (must pass before real orders)
- [x] Separate buyer and venue intake with courier handoff guard (demo).
- [x] Store per-venue estimated readiness, prevent handoff without it, expose ETA to courier (demo; code + SQL check).
- [ ] Test the exact buyer → dispatcher → courier sequence on **three physical devices**; verify two venues and late ETA update.
- [ ] Validate push delivery on signed-in dispatcher Android **after closing browser**; inspect opt-in subscriptions and Android notification permission.
- [ ] Confirm venue accounts and permissions; `shop_members` currently has no real staff connections.
- [ ] Confirm real venue menus, products, prices, pickup addresses, opening hours, stock-substitution process and consent.
- [ ] Define actual geographic zones, trip distance and **courier fuel/vehicle payer**; test city/dacha/multi-stop fares using measured rides.
- [ ] Define customer payment and vendor-settlement flows (cashless/cash), receipts, refunds, personal-data handling, consumer terms and insurance/liability; verify with qualified local accountant/lawyer before taking funds.
- [ ] Independently audit Supabase RLS, SECURITY DEFINER grants, stale RPC endpoints, API exposure and missing database migrations; review Supabase advisors.
- [ ] Reconcile repository migrations with actual Supabase migration history; test backup/recovery.
- [ ] Check mobile UX, phone contact, poor network behavior, error states, cancellation and fraud safeguards.
- [ ] Pilot only within safe/legal boundaries and with explicit go-live approval. Do not activate production automatically.

## First 100 real deliveries — operating rules
Before each: record venue source, route, courier, payment responsibility, quoted fee and estimated readiness.
After each: actual pickup, dropoff, courier reward, fuel responsibility, issues and **actual cash movement**; do not equate demo earnings with real payments.
Daily reconciliation: gross delivery income + platform fee/commission − courier payouts − any company-funded fuel/vehicle cost − payment fees/refunds − variable support costs. Separately track taxes and fixed costs. Exclude vendor merchandise proceeds from TEPLO revenue unless contracts/accounting establish otherwise.

## Stage gates
**0 — technical readiness:** both paths work end-to-end in demo and privileges reviewed.
**1 — controlled beta:** 2–3 participating venues, 1–2 couriers, 10–20 supervised test/real orders (no real money until compliance approved).
**2 — 100 paid deliveries:** positive unit economics by city/dacha/combined segments and measurable repeat orders.
**3 — founder exit:** documented dispatch script, courier SLA, exception manual, one trained replacement and actual profitability *after paying operator*.
At each stage stop/adjust if unit economics, safety, service or founder-hours goals fail.

## Decision ownership
Founder approves production, pricing, contracts, payments and hiring. Database changes and app deployments are recorded as GitHub commits / Supabase migrations. Admin reports must distinguish **test** and **real** transactions.

## Immediate next actions
1. Test readiness UI in dispatcher and courier on mobile.
2. Make dispatcher push deliver end-to-end, not only server-side.
3. Build explicit order financial ledger and daily reconciliation.
4. Audit real-launch security and payment/legal constraints.
5. Recruit initial participating venues and couriers; obtain price/address confirmations.

## Current useful URLs
- Dispatcher: https://kirillbebzenka-coder.github.io/teplo-app/pilot-dispatch.html?v=56
- Courier: https://kirillbebzenka-coder.github.io/teplo-app/pilot-courier.html?v=56
- Venue: https://kirillbebzenka-coder.github.io/teplo-app/partner.html?v=56
- Team: https://kirillbebzenka-coder.github.io/teplo-app/team.html?v=56
