# TEPLO release rules

The owner's priority is a working courier application with minimal manual operation.

- Stabilization before features. For a regression, diagnose the actual order and identify the blocked dependency before changing code.
- Never call an isolated component test proof that checkout-to-delivery works.
- Before publishing any order-flow change: run `node scripts/check-js.mjs`, `node tests/dispatcher-attention.test.mjs`, and execute `tests/checkout-to-delivery.sql` against the current backend through the authorized connector. It must pass. This SQL uses a disposable transaction and rolls back notifications/data; do not replace it with updates of existing user orders or closure of all slots.
- Check authenticated ownership/role guards when they change. Check the buyer-facing explanation of waiting/error states.
- Keep the two seeded demo venue simulation rules separate from real venues. Real venues must confirm their own orders. Never silently auto-confirm a real venue.
- Test queue visibility, courier claim, pickup, completion, one earnings record, and repeated checkout protection. For late-night demos verify a suitable test slot exists.
- Preserve black/pink/violet styling, existing data/roles/features. Keep real deliveries and payments disabled.
- Changes should be small and reversible. Use a development branch for future feature work; validate before promotion to main. Check GitHub workflow completion and deployed assets before claiming availability.
- State what was actually tested and what still requires physical-device or account testing. Do not ask the owner to rediscover technical root causes already available from the backend.
