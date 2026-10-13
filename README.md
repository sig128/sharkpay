# SHARKCARD

**Hold the token. Get SOL from creator fees. Redeem for game credit.**

SHARKCARD is a holder rewards platform. Every 30 minutes the server claims the pump.fun creator fees $SHARK trading has earned, and sends 80% of the new SOL to every $SHARK holder by average balance, automatically. Members buy platform-specific GTA Online Shark Cards with $SHARK at a fixed SOL price. An Apple Wallet pass shows your $SHARK holdings and the SOL owed to your linked wallets.

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

Shark Cards are paid in **$SHARK**. Apple Pay, Google Pay and Visa / Mastercard are shown as coming soon.

1. Each catalog item has a fixed `sol_price_lamports`. At checkout the server converts that SOL amount to $SHARK using live Jupiter prices for SOL and the token (`SHARK_PRICE_URL`). Prices from pools with less than `SHARK_MIN_LIQUIDITY_USD` are refused. If the token has a Token-2022 transfer fee, the amount is grossed up for it (`TOKEN_TRANSFER_FEE_BPS`, default 0; pump.fun coins have none) so the treasury nets the full price. The quote is held for `SHARK_QUOTE_TTL_SECONDS`.
2. The member pays a Solana Pay request (QR or "Open in wallet") to `SHARK_TREASURY_WALLET`. Each request carries a unique reference key.
3. The server finds the reference on-chain via `SOLANA_RPC_URL` (finalized only) and checks the mint, the recipient and the amount the treasury actually received. A transaction signature can settle only one payment.
4. The order is created and sent to the fulfilment provider. Delivery failures, underpayments and late payments become `refund_due` rows in `shark_payments`, which an operator refunds from the treasury to the recorded `payer`.

Checkout is closed until `TOKEN_MINT`, `SHARK_TREASURY_WALLET` and a fulfilment partner are all configured. Until then the site shows the Shark Card price list (fixed SOL prices) but nothing can be ordered. Live catalog rows need a SOL price.

### Holder rewards: automatic payouts

Holder rewards are paid automatically from the pump.fun creator (fee) wallet. Every `PAYOUT_INTERVAL_MINUTES` (default 30) the server:

1. Claims the creator fees into the fee wallet.
2. Treats any SOL above the float and what is already owed as new income. `HOLDER_SHARE_BPS` (default 8000 = 80%) goes to holders; the rest goes to operations (`OPS_WALLET`, or stays in the fee wallet if unset).
3. Splits the holder share between **all** $SHARK holder wallets, linked to the site or not, by their average balance across the holder snapshots taken every few minutes since the last run. Pools, the fee wallet, the treasury and the ops wallet are excluded.
4. Sends SOL to every wallet owed at least `MIN_PAYOUT_LAMPORTS` (default 1,000,000 = 0.001 SOL). Smaller amounts keep accumulating until they reach it.

There is no clearance window and no weekly period. Linking a wallet to an account only shows its owed and paid SOL on the Rewards page. The coin's trading fee is shown as `TRADE_FEE_BPS` (default 200 = 2%), but pump.fun sets the real fee; holders get their share of what the fee wallet actually receives.

| Variable | Purpose |
| --- | --- |
| `TOKEN_MINT` | The $SHARK mint. |
| `FEE_WALLET_SECRET_KEY` | Secret key of the pump.fun creator wallet (base58 or JSON array). Signs fee claims and payouts. Never logged. |
| `OPS_WALLET` | Optional. Receives the operations share. |
| `AUTO_PAYOUTS_ENABLED` | Must be `true` to run payouts. |
| `PAYOUT_INTERVAL_MINUTES` | Minutes between payout runs (default 30). |
| `MIN_PAYOUT_LAMPORTS` | Smallest amount sent to a wallet (default 1,000,000). |
| `OPERATOR_SECRET` | Bearer token for `/api/payouts` (at least 32 characters). |

Payouts are off until `TOKEN_MINT` and `FEE_WALLET_SECRET_KEY` are set and `AUTO_PAYOUTS_ENABLED=true`; the Rewards and Transparency pages say which one is missing. `GET /api/payouts` with `Authorization: Bearer $OPERATOR_SECRET` returns the payout status and who is owed; `POST /api/payouts` with the same header runs a payout cycle now instead of waiting for the timer. The endpoint is a 404 unless `OPERATOR_SECRET` is set.

**The float rule.** Whatever SOL is in the fee wallet before the first payout run is recorded as the float. It pays network fees and is never distributed. Don't send SOL to the fee wallet manually after that: anything above the float and the amounts already owed counts as new income and is paid out to holders.

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
cp .env.example .env.local      # optional for local development
npm run dev                     # http://localhost:3000
```

`APP_MODE` defaults to local development (`demo`), which relaxes the production secret checks and shows email sign-in codes from a local dev outbox. There is no demo data: every page shows real figures, and features that aren't configured yet say so.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build && npm start` | Production build |
| `npm test` | Vitest: payouts, ledger, checkout, redemption, auth, wallet and webhook tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `node scripts/generate-pass-assets.mjs` | Regenerates the Wallet pass icon and logo PNGs and the favicon |

### Production

Set `APP_MODE=production`. The server will not start without:

- `SESSION_SECRET`: at least 32 characters (`openssl rand -base64 48`)
- `DATA_ENCRYPTION_KEY`: 32 bytes, base64 (`openssl rand -base64 32`)

Production fails closed. Redemption returns 503 until a real fulfillment provider is integrated. Members only see catalog items that a provider has verified. Wallet passes are only issued once Apple signing is configured. Card issuance does not exist.

`DATABASE_PATH` points to a SQLite file (default `.data/sharkcard.db`). For more than one instance, move to Postgres. The `tx()` helper and the schema already use the same patterns: immediate transactions, unique idempotency keys, and append-only triggers.

---

## What's built

### Works now with real credentials

| Area | Notes |
| --- | --- |
| Microsoft sign-in | OIDC authorization code flow with PKCE, `state` and `nonce`, against the consumer tenant. Proves a Microsoft account only. |
| Steam sign-in | OpenID 2.0. Checks the namespace, mode, endpoint, exact `return_to`, claimed ID format and signed fields, and rejects nonce replays. Then calls Steam's `check_authentication` server-side. Proves a Steam ID, not game ownership. |
| Google sign-in | OIDC authorization code flow with PKCE, `state` and `nonce`. Requests `openid profile` only, so no email and no access to Google APIs. |
| X sign-in | OAuth 2.0 authorization code flow with PKCE as a confidential client, using read-only scopes. The account ID comes from `GET /2/users/me`, and the access token is revoked straight away and never stored. |
| Email codes | 6-digit codes via Resend, five attempts. Without Resend, local development shows codes from a dev outbox. |
| Sessions | Opaque token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over https). Only its hash is stored. Sign out and sign out everywhere both work. |
| Account model | Each member has a stable internal ID. Identities are unique per provider subject and never merged by name or email. Link and unlink need a sign-in from the last 10 minutes. You can't remove your last sign-in method. |
| Recovery codes | Single-use. Only a keyed hash is stored. Regenerating them invalidates the old set. |
| Solana wallet linking | The wallet signs a domain-bound text message with a 5-minute expiry and single use, verified with ed25519 on the server. One wallet per member, three wallets at most, and a cooldown before an unlinked wallet can be relinked. No transactions, approvals or seed phrases. |
| Automatic payouts | Fee claim, holder snapshots, average-balance split with floor rounding (dust carries to the next run), batched SOL transfers. Each run first settles the transfers from earlier runs and stops if one may still land, so a crash can't pay twice. |
| Ledger | Append-only double-entry in lamports. Database triggers block UPDATE and DELETE. Balances can't go negative, and every post is idempotent. |
| Redemption engine | Orders are created only after a $SHARK payment is confirmed. Each order has an idempotency key. State transitions are guarded, delivery failures mark a refund due, and uncertain outcomes are reconciled. Codes are encrypted at rest and revealed only to the owner. |
| Webhooks | HMAC-SHA256 signatures over `t.body`, 300-second tolerance, and an event-ID replay table. |
| Apple Wallet web service | Device registration, unregistration, list of updated serials, latest pass, and log endpoints, with `ApplePass` token auth. Signing uses `passkit-generator` and the APNs push uses HTTP/2. |
| Transparency | Creator fees received, holder and operations split, SOL paid and owed, recent payout runs and payouts with Solscan links, fee wallet and configuration. |
| Card waitlist | The email is encrypted at rest and looked up by keyed hash. |

### Not built (by design)

- **PlayStation sign-in.** Shown as "coming soon". Selecting PlayStation as your platform is never treated as verification.
- **Pay with SHARKCARD.** A planned payment card. It would need a regulated issuer whose program supports Apple Pay. There is only a waitlist; nothing can be activated.
- **GTA VI rewards.** Listed as an unavailable future category. Existing Shark Cards are not claimed to work in GTA VI.
- **Mainnet actions.** The app never mints tokens or changes authorities. The only transactions it signs are fee claims and holder payouts from the fee wallet, and only when automatic payouts are enabled.

---

## Remaining provider dependencies

These need agreements, approvals or credentials that code can't supply:

1. **A Shark Card fulfillment partner.** You need a licensed digital-goods distributor with a Rockstar or platform-store agreement that sells GTA Online Shark Card codes by API, per platform and region. Add a `FulfillmentProvider` adapter in `src/lib/server/fulfillment/provider.ts` (submit, status, void, webhook) and add its ID to the `FULFILLMENT_PROVIDER` enum. Catalog rows need `verified_live = 1` from the provider's feed before live members can see them.
2. **Xbox services relying party.** Linking Xbox profiles (gamertag and XUID) needs a relying party that Microsoft has approved for Xbox Live. Until you have one, keep `XBOX_LINKING_ENABLED=false`.
3. **PlayStation Partners access.** There's no public PSN OAuth. The adapter boundary is `playStationProvider` in `src/lib/server/auth/providers.ts`.
4. **Apple Pass Type ID certificate** (Apple Developer Program), the WWDR intermediate certificate, and the official "Add to Apple Wallet" badge. Download the badge from Apple and place it at `public/brand/apple/add-to-apple-wallet.svg`. The badge is only shown when that file exists *and* signing is configured.
5. **A card issuer** for "Pay with SHARKCARD", if that product is ever pursued.
6. **Legal review** of the reward model, SOL payout terms and the brand name (see below), done before launch in each region.

---

## Architecture

```
src/
  app/                    Next.js App Router pages and API route handlers
    api/auth/*            microsoft, xbox (link only), steam, google, x, email, logout, recovery
    api/checkout/shark    quote and confirm      api/orders/[id](/code)   status and owner-only code reveal
    api/wallet            challenge, verify, unlink                        api/account   preferences, unlink, recovery codes
    api/passkit/v1/*      Apple Wallet web service                       api/pass      signed .pkpass (fails closed)
    api/webhooks/*        fulfillment callbacks                          api/payouts   operator payout status / run now
    app/*                 Overview, Rewards, My Card, Activity, Transparency, Accounts, Receipts
  lib/server/             server-only: db, ledger, rewards, chain, catalog, orders, fulfillment, passes, issuer, auth, wallet
  components/             brand (card, pass, atmosphere), landing, app, auth, ui
tests/                    engine and end-to-end flow tests (in-memory DB)
```

- **Realms.** Tables keep a `realm` column; all data is in the `live` realm.
- **All money logic runs on the server.** The browser only sends intent (an item ID or a payment ID). Balances, prices, eligibility and provider status are always read from the database.
- **Prices.** Each Shark Card has a fixed SOL price. Members pay the $SHARK equivalent at checkout (live Jupiter prices, plus the token transfer fee). The website never moves funds.
- **Holder rewards.** A share of the creator fees the fee wallet receives, in SOL, sent automatically every payout run to any holder owed at least `MIN_PAYOUT_LAMPORTS`. There is no guaranteed yield.

---

## Brand and trademark risk

"Shark Card" is Rockstar Games' name for its GTA Online currency product. A rewards platform called **SHARKCARD** that redeems for Shark Cards is very likely to be seen as affiliated with Rockstar or Take-Two, or as infringing on their mark, and app stores, payment processors and Apple's Wallet review may reject it. The site never presents itself as an official Rockstar, GTA, Apple, Visa or Mastercard product and states its independence in the footer, on the card, on the pass and on receipts. That reduces the risk but doesn't remove it. Get trademark advice before launch, and be ready to switch the brand with `NEXT_PUBLIC_BRAND_NAME`.

Holder rewards depend on the creator fees trading actually generates. They can be zero. Nothing here promises a yield, an APY or a profit.
