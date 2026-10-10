# SHARKCARD

**Hold the token. Collect funded rewards. Redeem for game credit.**

SHARKCARD is a holder rewards platform. Token fees are collected and settled. The settled proceeds fund a rewards pool, and each holder's time-weighted share of that pool becomes reward credits. Credits can be redeemed for platform-specific GTA Online Shark Cards. An Apple Wallet pass shows your membership and balance.

> Independent rewards platform. Not affiliated with Rockstar Games or Take-Two Interactive.
> "Shark Card", "GTA" and "Grand Theft Auto" are trademarks of their owners. See [Brand and trademark risk](#brand-and-trademark-risk).

The brand name and ticker are configurable (`NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_TOKEN_TICKER`). The defaults are `SHARKCARD` and `$SHARK` (token name `SHARKCARD`, `NEXT_PUBLIC_TOKEN_NAME`).

### Deploying on Render

`render.yaml` is a Render Blueprint: one web service with a 1 GB persistent disk at `/var/data` for the SQLite database.

1. Render Dashboard → **New → Blueprint** → connect this GitHub repo → **Apply**. Render generates `SESSION_SECRET`, `DATA_ENCRYPTION_KEY` and the webhook secrets, and asks for the `sync: false` values. Leave any you don't have yet empty.
2. The site runs at `https://sharkcard.onrender.com` (or similar) straight away; `APP_URL` falls back to Render's address when it's empty.
3. Custom domain: service → **Settings → Custom Domains** → add it, create the DNS records Render shows, then set `APP_URL=https://yourdomain.com` and redeploy. Update the redirect URLs at Google, X and Microsoft to the new domain.

The service must stay at **one instance**: SQLite on a disk can't be shared. Render snapshots disks daily. A disk needs a paid instance (Starter or higher), and deploys have a few seconds of downtime because the disk moves between instances.

### Paying for Shark Cards with $SHARK

In the rewards dialog members choose **Reward credits** or **$SHARK**. Apple Pay, Google Pay and Visa / Mastercard are shown as coming soon.

1. The server prices the card: `usd_price_cents` from the provider catalog ÷ the live $SHARK price from `SHARK_PRICE_URL` (Jupiter). Prices from pools with less than `SHARK_MIN_LIQUIDITY_USD` are refused. The amount is grossed up for the Token-2022 transfer fee (`REWARD_FEE_BPS`) so the treasury nets the full price. The quote is held for `SHARK_QUOTE_TTL_SECONDS`.
2. The member pays a Solana Pay request (QR or "Open in wallet") to `SHARK_TREASURY_WALLET`. Each request carries a unique reference key.
3. The server finds the reference on-chain via `SOLANA_RPC_URL` (finalized only) and checks the mint, the recipient and the amount the treasury actually received. A transaction signature can settle only one payment.
4. The order is created and sent to the fulfilment provider. Delivery failures, underpayments and late payments become `refund_due` rows in `shark_payments`, which an operator refunds from the treasury to the recorded `payer`.

Checkout is closed until `TOKEN_MINT`, `SHARK_TREASURY_WALLET` and a fulfilment provider are all configured. Live catalog rows need `usd_price_cents`.

### Buying the token

The landing page's "Buy" section only links out to third parties; the site never sells tokens, never takes card payments for tokens and never holds user funds.

- **Card / Apple Pay / Google Pay** (needs `MOONPAY_PUBLISHABLE_KEY`): MoonPay sells SOL into the user's own wallet. Card on-ramps only sell listed assets, so a new token can't be bought with a card in one step — the user swaps SOL for the token next.
- **Jupiter / Raydium swaps** (needs `TOKEN_MINT`): deep links with the mint prefilled. The user signs in their own wallet.
- With no valid `TOKEN_MINT` the section says the token isn't live and shows no buy links, so nobody is pointed at a fake token.

---

## Quick start

Requires Node 22.5 or later (it uses the built-in `node:sqlite`).

```bash
npm install
cp .env.example .env.local      # optional in demo mode
npm run dev                     # http://localhost:3000
```

To try it, open `/login` and choose **Explore demo**. Each demo gets its own isolated sandbox: a member with 2,840 available and 360 pending credits, five reward periods, a demo catalog, and past orders. Nothing in the demo can touch real credits or real accounts.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build && npm start` | Production build |
| `npm test` | Vitest: reward engine, ledger, redemption, auth, wallet and webhook tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `node scripts/generate-pass-assets.mjs` | Regenerates the Wallet pass icon and logo PNGs and the favicon |

### Production

Set `APP_MODE=production`. The server will not start without:

- `SESSION_SECRET`: at least 32 characters (`openssl rand -base64 48`)
- `DATA_ENCRYPTION_KEY`: 32 bytes, base64 (`openssl rand -base64 32`)

Production fails closed. Live redemption returns 503 until a real fulfillment provider is integrated. Live accounts only see catalog items that a provider has verified. Wallet passes are only issued once Apple signing is configured. Card issuance does not exist. Simulated providers never run for live accounts, whatever the mode.

`DATABASE_PATH` points to a SQLite file (default `.data/sharkcard.db`). For more than one instance, move to Postgres. The `tx()` helper and the schema already use the same patterns: immediate transactions, unique idempotency keys, and append-only triggers.

---

## What's live vs simulated

### Live (works now with real credentials)

| Area | Notes |
| --- | --- |
| Microsoft sign-in | OIDC authorization code flow with PKCE, `state` and `nonce`, against the consumer tenant. Proves a Microsoft account only. |
| Steam sign-in | OpenID 2.0. Checks the namespace, mode, endpoint, exact `return_to`, claimed ID format and signed fields, and rejects nonce replays. Then calls Steam's `check_authentication` server-side. Proves a Steam ID, not game ownership. |
| Google sign-in | OIDC authorization code flow with PKCE, `state` and `nonce`. Requests `openid profile` only, so no email and no access to Google APIs. |
| X sign-in | OAuth 2.0 authorization code flow with PKCE as a confidential client, using read-only scopes. The account ID comes from `GET /2/users/me`, and the access token is revoked straight away and never stored. |
| Email codes | 6-digit codes via Resend, five attempts. Without Resend, demo mode shows codes from a local dev outbox. |
| Sessions | Opaque token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over https). Only its hash is stored. Sign out and sign out everywhere both work. |
| Account model | Each member has a stable internal ID. Identities are unique per provider subject and never merged by name or email. Link and unlink need a sign-in from the last 10 minutes. You can't remove your last sign-in method. |
| Recovery codes | Single-use. Only a keyed hash is stored. Regenerating them invalidates the old set. |
| Solana wallet linking | The wallet signs a domain-bound text message with a 5-minute expiry and single use, verified with ed25519 on the server. One wallet per member, three wallets at most, and a cooldown before an unlinked wallet can be relinked. No transactions, approvals or seed phrases. |
| Reward engine | BigInt time-weighted balances, exclusions, floor allocation, remainder carried forward, finalized periods only, no double allocation. The Token-2022 transfer fee uses the ceiling rule. |
| Ledger | Append-only double-entry. Database triggers block UPDATE and DELETE in the live realm. Balances can't go negative, and every post is idempotent. |
| Redemption engine | 90-second quotes. Credits are reserved atomically, and each order has an idempotency key and is unique per quote. State transitions are guarded, failures reverse automatically, and uncertain outcomes are reconciled. Codes are encrypted at rest and revealed only to the owner. |
| Webhooks and chain ingest | HMAC-SHA256 signatures over `t.body`, 300-second tolerance, and an event-ID replay table. Ingest only accepts finalized events, and duplicates are ignored. |
| Apple Wallet web service | Device registration, unregistration, list of updated serials, latest pass, and log endpoints, with `ApplePass` token auth. Signing uses `passkit-generator` and the APNs push uses HTTP/2. |
| Transparency | Fees (withheld, harvested, withdrawn), settlements, holder and operations split, credit obligations, operating costs and periods. Token inventory is reported separately from cash. |
| Card waitlist | The email is encrypted at rest and looked up by keyed hash. |

### Simulated (demo realm only)

| Area | Notes |
| --- | --- |
| Holdings, fees, settlements | Seeded so the engine produces the fixture amounts. Labelled as "Product preview" or "Sample values" everywhere they appear. |
| Catalog | A 6-tier × 3-platform × 3-region demo catalog. Costs are illustrative, and Megalodon on Xbox is out of stock. |
| Fulfillment | The demo provider has four scenarios: instant, pending (delivers after about 8 seconds), fail (credits returned) and timeout (reconciled). Codes look like `DEMO-NOT-REDEEMABLE-XXXX-XXXX` and cannot be redeemed. |
| Wallet pass | A faithful visual preview with front and back. No signed `.pkpass` is issued for demo sessions. |

### Not built (by design)

- **PlayStation sign-in.** Shown as "coming soon". Selecting PlayStation as your platform is never treated as verification.
- **Pay with SHARKCARD.** A planned payment card. It would need a regulated issuer whose program supports Apple Pay. There is only a waitlist; nothing can be activated.
- **GTA VI rewards.** Listed as an unavailable future category. Existing Shark Cards are not claimed to work in GTA VI.
- **Mainnet actions.** The app never mints tokens, changes authorities, signs transactions or moves funds.

---

## Remaining provider dependencies

These need agreements, approvals or credentials that code can't supply:

1. **A Shark Card fulfillment partner.** You need a licensed digital-goods distributor with a Rockstar or platform-store agreement that sells GTA Online Shark Card codes by API, per platform and region. Add a `FulfillmentProvider` adapter in `src/lib/server/fulfillment/provider.ts` (submit, status, void, webhook) and add its ID to the `FULFILLMENT_PROVIDER` enum. Catalog rows need `verified_live = 1` from the provider's feed before live members can see them.
2. **Xbox services relying party.** Linking Xbox profiles (gamertag and XUID) needs a relying party that Microsoft has approved for Xbox Live. Until you have one, keep `XBOX_LINKING_ENABLED=false`.
3. **PlayStation Partners access.** There's no public PSN OAuth. The adapter boundary is `playStationProvider` in `src/lib/server/auth/providers.ts`.
4. **Apple Pass Type ID certificate** (Apple Developer Program), the WWDR intermediate certificate, and the official "Add to Apple Wallet" badge. Download the badge from Apple and place it at `public/brand/apple/add-to-apple-wallet.svg`. The badge is only shown when that file exists *and* signing is configured.
5. **A Solana indexer.** It must push finalized balance, fee and settlement events to `POST /api/ingest/chain`, plus a watermark. A period only finalizes after the watermark passes its end.
6. **A settlement process.** Someone has to swap the withdrawn fee tokens to stablecoin and record each settlement with its real costs. Only settled proceeds fund credits.
7. **A card issuer** for "Pay with SHARKCARD", if that product is ever pursued.
8. **Legal review** of the reward model, credit terms, the transfer-fee disclosure and the brand name (see below), done before launch in each region.

---

## Architecture

```
src/
  app/                    Next.js App Router pages and API route handlers
    api/auth/*            microsoft, xbox (link only), steam, google, x, email, demo, logout, recovery
    api/redemptions       quote and confirm      api/orders/[id](/code)   status and owner-only code reveal
    api/wallet            challenge, verify, unlink                        api/account   preferences, unlink, recovery codes
    api/passkit/v1/*      Apple Wallet web service                       api/pass      signed .pkpass (fails closed)
    api/webhooks/*        fulfillment callbacks                          api/ingest/chain   indexer push
    app/*                 Overview, Rewards, My Card, Activity, Transparency, Accounts, Receipts
  lib/server/             server-only: db, ledger, rewards, chain, catalog, orders, fulfillment, passes, issuer, auth, wallet
  components/             brand (card, pass, atmosphere), landing, app, auth, ui
tests/                    engine and end-to-end flow tests (in-memory DB)
```

- **Realms.** Every row has a `realm` column: either `live` or `demo:<id>`. Demo sandboxes can't read or write live data, and live accounts never see demo catalog rows.
- **All money logic runs on the server.** The browser only sends intent (an item ID, a quote ID, an idempotency key). Balances, prices, eligibility and provider status are always read from the database.
- **Credits.** 1 credit = $0.01 of settled holder funding (`CREDIT_USD_MICROS`). Credits can't be transferred or exchanged for cash, and they are not GTA$.
- **Allocation.** For each period: budget × (your time-weighted eligible balance ÷ total eligible), rounded down. Dust, shares of unlinked wallets, and budgets with zero eligible weight carry forward. Allocations stay pending for `PENDING_CLEARANCE_HOURS` before they become available.

---

## Brand and trademark risk

"Shark Card" is Rockstar Games' name for its GTA Online currency product. A rewards platform called **SHARKCARD** that redeems for Shark Cards is very likely to be seen as affiliated with Rockstar or Take-Two, or as infringing on their mark, and app stores, payment processors and Apple's Wallet review may reject it. The site never presents itself as an official Rockstar, GTA, Apple, Visa or Mastercard product and states its independence in the footer, on the card, on the pass and on receipts. That reduces the risk but doesn't remove it. Get trademark advice before launch, and be ready to switch the brand with `NEXT_PUBLIC_BRAND_NAME`.

Holder rewards depend on fees actually collected and settled. They can be zero. Nothing here promises a yield, an APY or a profit.
