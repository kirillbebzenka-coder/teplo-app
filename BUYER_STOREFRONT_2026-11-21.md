# Guest storefront v71

The home page is a compact two-column grid on phones; all three current venues fit above the bottom navigation on normal phone screens. Short displays use a compact variant. There is no restaurant carousel or tall promotional banner. Public catalogue reads populate the two demo shops dynamically; the existing Felicita preview remains explicitly a preview. No unconnected partner, rating, opening status or delivery estimate is invented.

Primary navigation: home, cart, orders, profile. Public menus and search do not require sign-in. Existing checkout authentication and server RLS/RPC remain unchanged. Buyer pages opt out only of staff role navigation replacing their four public tabs; role permission redirects are retained. Existing team pages and links remain reachable.

The locality selector reuses the canonical delivery areas and stores only the selected area code in session storage. It preselects that area at checkout; it does not guess an address or change delivery tariffs/deadlines. The menu, combined cart, retry request ID, checkout validation, address fields and order progress are retained. The existing session cart keeps product IDs and quantities and survives navigation between stores. No private address/contact data is stored by the new home page.

The menu page now prioritizes products, with a local product search and calmer account, cart and checkout panels. Cart/profile deep links reopen their section after catalogue hydration. Felicita still uses its existing read-only demo menu and has the shared buyer navigation.

Design references reviewed: https://glovoapp.com/uk/ua (public search listing; direct retrieval asked for JavaScript verification), https://bolt.eu/en/food/ (discover, order, track; address-based browsing), https://explore.wolt.com/en/deu/how-search-works (venue/product search and categories). For this small local catalogue, use a direct grid instead of recommendation rows.

Validation: syntax, buyer-storefront unit/controller checks, checkout-network, existing dispatcher/courier/timer suites. Backend disposable transaction checkout-to-delivery passed, including two pickups, courier claim, completion, a single earnings record and duplicate checkout protection. Access-and-dispatch and role-RLS tests also passed. Browser phone checks are performed after deployment; no real purchase/registration or physical delivery is claimed. Real delivery tariffs/payments remain disabled. No schema migration or data deletion.

Rollback base: 2ea61f0325ef5982a45d813d973cc35614337718.
