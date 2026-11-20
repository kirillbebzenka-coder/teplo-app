# Dispatcher workspace v69

Default screen is the delivery queue. Three visible filters: active, needs assignment, attention. Search matches ID, buyer order ID, address, recipient name/phone, venue, contents and courier name. Unresolved courier/dispatcher issues and existing time thresholds place an active delivery first. Archive is separate (last 80 terminal deliveries; active deliveries are fully paginated).

Four persistent tabs: orders, couriers, venue confirmations, more. More holds existing pickup-slot capacity/open controls, notification opt-in and role links. Courier rows open only that person's active jobs. Admin self-testing remains available for assignment but is excluded from operational availability counts.

A selected delivery shows all pickup points, recipient address, map/call links, server-time timer, assigned courier and one primary action when applicable. Contents/costs, exceptional management, notes and history are disclosures. Existing RPCs, server role/ownership guards, manual-delivery confirmation, slot controls and deadlines are retained. An issue remains in attention until a newer `resolved` note. Draft fields/disclosures survive delivery-card refresh in memory; no private data is written to local storage. An offline poll retains previously fetched jobs. Sign-out/role revocation clears private queues, drafts and counts. Repeated delivery mutations are blocked while one is in flight.

`pilot-dispatch.html?preview=1` and `dispatcher-design.html` show the same shell/controller/cards against in-memory fixtures. Preview does not import Supabase, role-portal or push, has no authentication requests, and refuses all write RPCs. Fixture contacts/addresses are fictional.

Validation: JavaScript syntax; existing attention, checkout-network, courier-workspace, courier-controller and delivery-timer suites; new dispatcher board/controller suites. Authorized backend transactional tests checkout-to-delivery, access-and-dispatch, role-rls, manual completion and courier issue passed against the current project; all fixtures rolled back. These tests are not a physical-device registration, push or delivery trial. Real deliveries/payments remain disabled. No schema migration or data removal.

Previous production commit: 9a2c91e7b9852de0662bed6aca6308db11e75433.
