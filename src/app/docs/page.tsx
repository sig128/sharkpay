import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { brand } from "@/config/brand";
import { CARD_TIERS } from "@/config/tiers";
import { Wordmark } from "@/components/brand/Wordmark";
import { Contact } from "@/components/legal/LegalPage";
import { DocsToc, type TocGroup } from "@/components/docs/DocsToc";
import { env, integrations } from "@/lib/server/env";
import { payoutBlocker } from "@/lib/server/rewards/autopay";
import { fmtGta, fmtInt, fmtSol } from "@/lib/format";

export const metadata: Metadata = {
  title: "Docs",
  description: `How ${brand.name} works: ${brand.ticker}, automatic SOL holder payouts every 30 minutes, Shark Card checkout, accounts, wallets and safety.`,
  alternates: { canonical: "/docs" },
};

export const dynamic = "force-dynamic";

const toc: TocGroup[] = [
  {
    title: "Getting started",
    items: [
      { id: "overview", label: "What is " + brand.name },
      { id: "quick-start", label: "Quick start" },
      { id: "token", label: `The ${brand.ticker} token` },
    ],
  },
  {
    title: "Holder rewards",
    items: [
      { id: "rewards-source", label: "Where rewards come from" },
      { id: "payout-cycle", label: "The 30-minute payout cycle" },
      { id: "your-share", label: "How your share is calculated" },
      { id: "example", label: "Worked example" },
      { id: "minimum", label: "Minimum payout & accumulation" },
      { id: "eligibility", label: "Who is and isn't paid" },
      { id: "fee-wallet", label: "The fee wallet" },
    ],
  },
  {
    title: "Shark Cards",
    items: [
      { id: "prices", label: "Price list" },
      { id: "checkout", label: `Paying in ${brand.ticker}` },
      { id: "orders", label: "Order statuses" },
      { id: "refunds", label: "Refunds" },
      { id: "redeeming", label: "Redeeming your code" },
    ],
  },
  {
    title: "Your account",
    items: [
      { id: "sign-in", label: "Signing in" },
      { id: "wallets", label: "Linking wallets" },
      { id: "wallet-pass", label: "Apple Wallet pass" },
      { id: "recovery", label: "Recovery codes" },
    ],
  },
  {
    title: "Trust",
    items: [
      { id: "transparency", label: "Transparency & verifying" },
      { id: "security", label: "Security promises" },
      { id: "risks", label: "Risks & disclaimers" },
      { id: "roadmap", label: "Roadmap" },
      { id: "glossary", label: "Glossary" },
      { id: "help", label: "Getting help" },
    ],
  },
];

function Section({ id, title, eyebrow, children }: { id: string; title: string; eyebrow?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-line pt-10 first:border-t-0 first:pt-0">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 id={`${id}-h`} className="display mt-2 text-[clamp(1.9rem,4vw,2.6rem)] text-warm">
        <a href={`#${id}`} className="group">
          {title}
          <span aria-hidden="true" className="ml-3 text-muted opacity-0 transition-opacity group-hover:opacity-100">
            #
          </span>
        </a>
      </h2>
      <div className="legal mt-5 space-y-4 text-[0.98rem] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Callout({ tone = "info", title, children }: { tone?: "info" | "warn" | "ok"; title: string; children: ReactNode }) {
  const color = { info: "border-sky-400/30 bg-sky-400/5", warn: "border-butter/40 bg-butter/5", ok: "border-mint/40 bg-mint/5" }[tone];
  return (
    <div className={`rounded-2xl border p-4 md:p-5 ${color}`}>
      <p className="font-semibold text-warm">{title}</p>
      <div className="mt-1.5 space-y-2 text-[0.95rem]">{children}</div>
    </div>
  );
}

function Steps({ items }: { items: Array<{ title: string; body: ReactNode }> }) {
  return (
    <ol className="!list-none !pl-0 space-y-3">
      {items.map((s, i) => (
        <li key={s.title} className="flex gap-4 rounded-2xl border border-line bg-surface/40 p-4">
          <span className="num flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong text-sm text-warm">
            {i + 1}
          </span>
          <div>
            <p className="font-semibold text-warm">{s.title}</p>
            <div className="mt-1 text-[0.95rem]">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-surface/60 text-warm">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-3 align-top ${j === 0 ? "text-warm" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded-md border border-line bg-surface/60 px-1.5 py-0.5 font-mono text-[0.85em] text-warm">{children}</code>
);

export default function DocsPage() {
  const e = env();
  const live = integrations();
  const blocker = payoutBlocker();
  const share = e.HOLDER_SHARE_BPS / 100;
  const ops = 100 - share;
  const tradeFee = e.TRADE_FEE_BPS / 100;
  const every = e.PAYOUT_INTERVAL_MINUTES;
  const snap = e.SNAPSHOT_INTERVAL_MINUTES;
  const minPayout = fmtSol(e.MIN_PAYOUT_LAMPORTS);
  const minHold = `${fmtInt(e.MIN_ELIGIBLE_BALANCE)} ${brand.ticker}`;
  const quoteMinutes = Math.round(e.SHARK_QUOTE_TTL_SECONDS / 60);
  const mint = e.TOKEN_MINT;

  const income = 1_000_000_000;
  const pool = Math.floor((income * e.HOLDER_SHARE_BPS) / 10_000);
  const holders = [
    { name: "Wallet A", avg: 5_000_000 },
    { name: "Wallet B", avg: 3_000_000 },
    { name: "Wallet C", avg: 2_000_000 },
  ];
  const totalAvg = holders.reduce((s, h) => s + h.avg, 0);

  const signIn = [
    live.google && "Google",
    live.x && "X",
    live.microsoft && "Microsoft",
    live.steam && "Steam",
    live.email && "an email code",
  ].filter(Boolean) as string[];

  return (
    <main id="main" className="noise min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-midnight/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-4">
            <Wordmark />
            <span className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted">
              Docs
            </span>
          </div>
          <nav className="flex items-center gap-5 text-sm text-muted">
            <Link href="/" className="hidden hover:text-warm sm:inline">
              Home
            </Link>
            <Link href="/#faq" className="hidden hover:text-warm sm:inline">
              FAQ
            </Link>
            <Link href="/login" className="rounded-full border border-line-strong px-4 py-1.5 text-warm hover:border-warm/60">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[230px_minmax(0,1fr)] lg:py-16">
        <aside className="hidden lg:block">
          <div className="sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto pb-8">
            <DocsToc groups={toc} />
          </div>
        </aside>

        <article className="max-w-3xl">
          <p className="eyebrow">Documentation</p>
          <h1 className="display mt-3 text-[clamp(2.8rem,8vw,5rem)]">
            How {brand.name} <span className="text-sunset-flow-soft">works</span>
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-warm/90">
            Everything about {brand.ticker}, the automatic SOL payouts to holders, buying Shark Cards, your account and how
            to check every number yourself. The figures on this page are read from the live configuration, so they always
            match what the site actually does.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 font-mono text-[0.7rem] uppercase tracking-[0.12em]">
            <span className={`rounded-full border px-3 py-1 ${blocker ? "border-butter/40 text-butter" : "border-mint/40 text-mint"}`}>
              {blocker ? "Payouts not live yet" : "Payouts live"}
            </span>
            <span className="rounded-full border border-line px-3 py-1 text-muted">Every {every} min</span>
            <span className="rounded-full border border-line px-3 py-1 text-muted">{share}% to holders</span>
            <span className="rounded-full border border-line px-3 py-1 text-muted">Min payout {minPayout}</span>
          </div>

          <details className="mt-8 rounded-2xl border border-line p-4 lg:hidden">
            <summary className="cursor-pointer font-semibold text-warm">On this page</summary>
            <div className="mt-4">
              <DocsToc groups={toc} />
            </div>
          </details>

          <div className="mt-14 space-y-14">
            {/* ------------------------------------------------ Getting started */}
            <Section id="overview" eyebrow="Getting started" title={`What is ${brand.name}?`}>
              <p>
                {brand.name} is an independent rewards platform built around the {brand.ticker} token on Solana. It does two
                things:
              </p>
              <ul>
                <li>
                  <strong>Pays holders in SOL, automatically.</strong> Every {every} minutes, {share}% of the creator fees the
                  coin earns from buys and sells is split between every wallet that holds {brand.ticker} and sent straight to
                  those wallets. You don&apos;t have to claim, stake or sign anything.
                </li>
                <li>
                  <strong>Sells GTA Online Shark Cards for {brand.ticker}.</strong> Each card has a fixed price in SOL. You pay
                  the equivalent amount of {brand.ticker} at checkout and receive a code to redeem on your platform.
                </li>
              </ul>
              <Callout title="Independent platform">
                <p>
                  {brand.legal.independence} We never ask for your Rockstar, Xbox, PlayStation or Steam password, and we
                  can&apos;t add GTA$ to your account directly.
                </p>
              </Callout>
            </Section>

            <Section id="quick-start" title="Quick start">
              <Steps
                items={[
                  {
                    title: `Get ${brand.ticker}`,
                    body: (
                      <>
                        Buy {brand.ticker} with any Solana wallet (Phantom, Solflare, Backpack and others). Always check the
                        contract address against the one in <a href="#token">The {brand.ticker} token</a>.
                      </>
                    ),
                  },
                  {
                    title: "Hold it in your own wallet",
                    body: (
                      <>
                        That&apos;s it for rewards. Every holder wallet with at least {minHold} on average is paid SOL
                        automatically every {every} minutes once it&apos;s owed at least {minPayout}.
                      </>
                    ),
                  },
                  {
                    title: "Sign in (optional)",
                    body: (
                      <>
                        Sign in with {signIn.length ? signIn.join(", ") : "a supported account"} to see your payouts, pick a
                        Shark Card goal and buy cards.
                      </>
                    ),
                  },
                  {
                    title: "Link your wallet (optional)",
                    body: (
                      <>
                        Linking is a one-time signature that proves the wallet is yours, so your dashboard can show its
                        rewards. It can&apos;t move tokens, and you get paid whether you link or not.
                      </>
                    ),
                  },
                  {
                    title: "Buy a Shark Card",
                    body: <>When checkout is open, pick a card, pay in {brand.ticker} and redeem the code on your platform.</>,
                  },
                ]}
              />
            </Section>

            <Section id="token" title={`The ${brand.ticker} token`}>
              <Table
                head={["Detail", "Value"]}
                rows={[
                  ["Network", "Solana"],
                  [
                    "Contract address (mint)",
                    mint ? (
                      <span className="break-all font-mono text-warm">
                        {mint}{" "}
                        <a href={`https://solscan.io/token/${mint}`} target="_blank" rel="noopener noreferrer">
                          Solscan
                        </a>
                      </span>
                    ) : (
                      "Not launched yet. It will be published here and on our X account at launch."
                    ),
                  ],
                  ["Launchpad", "pump.fun"],
                  ["Buy / sell fee shown", `${tradeFee}% (set by pump.fun, not by ${brand.name})`],
                  ["Share of creator fees to holders", `${share}%`],
                ]}
              />
              <Callout tone="warn" title="Only trust the address on this page">
                <p>
                  Scammers launch copycat tokens with the same name and ticker. The mint address above is the only{" "}
                  {brand.ticker}. We will never DM you first, ask for your seed phrase or ask you to &ldquo;validate&rdquo;
                  or &ldquo;sync&rdquo; a wallet.
                </p>
              </Callout>
            </Section>

            {/* ------------------------------------------------ Holder rewards */}
            <Section id="rewards-source" eyebrow="Holder rewards" title="Where rewards come from">
              <p>
                Every buy and sell of a pump.fun coin pays a trading fee. Part of that fee is a <strong>creator fee</strong>{" "}
                that pump.fun sends to the coin&apos;s creator wallet, which we call the <strong>fee wallet</strong>.{" "}
                {brand.name} claims those creator fees automatically and shares them:
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-mint/40 bg-mint/5 p-5">
                  <p className="num text-4xl text-mint">{share}%</p>
                  <p className="mt-1 font-semibold text-warm">To {brand.ticker} holders</p>
                  <p className="mt-1 text-sm">Split by average balance and sent as SOL.</p>
                </div>
                <div className="rounded-2xl border border-line bg-surface/40 p-5">
                  <p className="num text-4xl text-warm">{ops}%</p>
                  <p className="mt-1 font-semibold text-warm">To operations</p>
                  <p className="mt-1 text-sm">Servers, RPC, network fees, development and Shark Card fulfilment.</p>
                </div>
              </div>
              <p>
                pump.fun decides how large the creator fee is, and it can change with the coin&apos;s market cap and
                pump.fun&apos;s own rules. {brand.name} doesn&apos;t control it. What we guarantee is the split: {share}% of
                whatever SOL actually arrives in the fee wallet goes to holders. More trading volume means more fees, and no
                trading means no rewards.
              </p>
            </Section>

            <Section id="payout-cycle" title={`The ${every}-minute payout cycle`}>
              <p>
                A payout run starts automatically every {every} minutes. Each run goes through the same steps, in order:
              </p>
              <Steps
                items={[
                  {
                    title: "Settle the previous run",
                    body: (
                      <>
                        Any transfer from an earlier run is checked on-chain first. If one could still land, the run stops
                        there and sends nothing, so nobody can ever be paid twice.
                      </>
                    ),
                  },
                  {
                    title: "Claim creator fees",
                    body: (
                      <>
                        The server claims the pending pump.fun creator fees into the fee wallet. If the coin has moved to
                        PumpSwap, the fees arrive as wrapped SOL and are unwrapped to plain SOL. Before signing, the claim
                        transaction is checked to make sure it can only add SOL to the fee wallet.
                      </>
                    ),
                  },
                  {
                    title: "Measure new income",
                    body: (
                      <>
                        New income = fee wallet balance − SOL already owed to holders − the fee wallet float (see{" "}
                        <a href="#fee-wallet">The fee wallet</a>). Only SOL that is genuinely new is shared.
                      </>
                    ),
                  },
                  {
                    title: `Split ${share} / ${ops}`,
                    body: <>{share}% of the new income goes into the holder pool, the rest to operations.</>,
                  },
                  {
                    title: "Credit holders",
                    body: (
                      <>
                        The holder pool is credited to every eligible wallet in proportion to its average {brand.ticker}{" "}
                        balance since the previous run. Fractions too small to split stay in the pool for the next run.
                      </>
                    ),
                  },
                  {
                    title: "Send SOL",
                    body: (
                      <>
                        Every wallet owed at least {minPayout} is sent its full balance in ordinary Solana transfers (up to
                        18 wallets per transaction). Each transaction is recorded before it is broadcast and confirmed
                        afterwards.
                      </>
                    ),
                  },
                ]}
              />
              {blocker && (
                <Callout tone="warn" title="Status: not live yet">
                  <p>{blocker} Until then no fees are claimed and nothing is paid.</p>
                </Callout>
              )}
            </Section>

            <Section id="your-share" title="How your share is calculated">
              <p>
                Every {snap} minutes the server reads the {brand.ticker} balance of every holder wallet directly from the
                Solana blockchain. That reading is called a <strong>snapshot</strong>. At payout time, your weight is the sum
                of your balance across all snapshots taken since the previous run, which is the same as your average balance
                over that window.
              </p>
              <div className="rounded-2xl border border-line bg-surface/40 p-5 font-mono text-sm text-warm">
                your credit = holder pool × (your average balance ÷ sum of all eligible average balances)
              </div>
              <ul>
                <li>
                  <strong>Holding time matters.</strong> With {Math.round(every / snap)} snapshots per run, buying right
                  before a payout earns only the snapshots you were present for. Holding through the whole window earns your
                  full share. This makes it pointless to buy just before a payout and sell right after.
                </li>
                <li>
                  <strong>All your token accounts count.</strong> If one wallet holds {brand.ticker} in more than one token
                  account, the balances are added together.
                </li>
                <li>
                  <strong>The maths rounds down, never up.</strong> Credits are calculated in lamports (1 SOL =
                  1,000,000,000 lamports) with exact integer maths. Leftover dust stays in the pool and is shared next
                  time.
                </li>
              </ul>
            </Section>

            <Section id="example" title="Worked example">
              <p>
                Say {fmtSol(income)} of new creator fees arrives during a run. {share}% of that, {fmtSol(pool)}, goes to the
                holder pool. Three wallets are eligible:
              </p>
              <Table
                head={["Wallet", `Average ${brand.ticker}`, "Share", "Credited this run"]}
                rows={holders.map((h) => [
                  h.name,
                  <span key="a" className="num">{fmtInt(h.avg)}</span>,
                  <span key="s" className="num">{((h.avg / totalAvg) * 100).toFixed(0)}%</span>,
                  <span key="c" className="num text-warm">{fmtSol(Math.floor((pool * h.avg) / totalAvg))}</span>,
                ])}
              />
              <p>
                All three are owed more than {minPayout}, so all three are sent SOL in the same run. The other{" "}
                {fmtSol(income - pool)} goes to operations.
              </p>
            </Section>

            <Section id="minimum" title="Minimum payout & accumulation">
              <p>
                A wallet is only sent SOL once it is owed at least <strong>{minPayout}</strong>. Below that, a transfer to a
                brand-new wallet would fail, because Solana requires every account to hold a small minimum balance (called
                rent), and the network fee would eat a large part of a tiny payment.
              </p>
              <p>
                Nothing is lost. Smaller amounts <strong>accumulate</strong> run after run and are sent in full as soon as the
                total reaches {minPayout}. Your dashboard shows what you&apos;re owed right now.
              </p>
              <Callout title="Who pays the network fee?">
                <p>
                  Network fees for payouts come out of the fee income before it is shared. You receive the full amount
                  credited to you and never pay anything to receive a payout.
                </p>
              </Callout>
            </Section>

            <Section id="eligibility" title="Who is and isn't paid">
              <Table
                head={["Wallet", "Paid?"]}
                rows={[
                  [`Any personal wallet holding ≥ ${minHold} on average`, "Yes, automatically"],
                  ["Wallets that aren't linked to a SHARKCARD account", "Yes. Linking is never required"],
                  [`Wallets holding less than ${minHold} on average`, "No"],
                  ["The pump.fun bonding curve and PumpSwap / DEX pool accounts", "No. Program-owned accounts are skipped automatically"],
                  ["The fee wallet, operations wallet and checkout treasury", "No"],
                  ["Addresses on the exclusion list (for example burn or liquidity addresses)", "No"],
                  ["Tokens held on a centralised exchange", "No. The exchange's wallet holds them, not you"],
                ]}
              />
              <p>
                Excluded wallets simply don&apos;t take part. Their would-be share goes to everyone else.
              </p>
            </Section>

            <Section id="fee-wallet" title="The fee wallet">
              <ul>
                <li>
                  The fee wallet is the pump.fun creator wallet of {brand.ticker}. Every claim and every payout is sent from
                  it, so anyone can follow its full history on Solscan.
                </li>
                <li>
                  <strong>The float.</strong> SOL that was already in the fee wallet before the first payout run is kept
                  aside to pay network fees. It is never counted as income. Everything that arrives afterwards is shared.
                </li>
                <li>
                  <strong>Solvency.</strong> Before sending, the server checks that the fee wallet holds enough SOL to cover
                  everything it owes. If it ever doesn&apos;t, payouts wait instead of going out partially.
                </li>
                <li>
                  <strong>Crash-safe.</strong> Every payout transaction is saved before it is broadcast. If the server
                  restarts mid-run, the next run checks each saved transaction on-chain and settles or retries it. A
                  transaction that expired without landing is retried, and one that landed is never sent again.
                </li>
              </ul>
            </Section>

            {/* ------------------------------------------------ Shark Cards */}
            <Section id="prices" eyebrow="Shark Cards" title="Price list">
              <p>
                Every card has a <strong>fixed price in SOL</strong>. You pay the {brand.ticker} equivalent at the moment you
                check out, so if {brand.ticker} goes up, the same card costs fewer tokens.
              </p>
              <Table
                head={["Card", "GTA$", "Price"]}
                rows={CARD_TIERS.map((t) => [
                  t.name,
                  <span key="g" className="num">{fmtGta(t.gta)}</span>,
                  <span key="p" className="num text-warm">{fmtSol(t.lamports)}</span>,
                ])}
              />
              <p>
                Cards are for GTA Online (GTA V) on PC, PlayStation 5 and Xbox Series X|S. Each code works only on the
                platform and region it was issued for. What you can order depends on our fulfilment partner&apos;s stock in
                your region.
              </p>
              {!live.liveFulfillment && (
                <Callout tone="warn" title="Checkout isn't open yet">
                  <p>
                    Orders open once {brand.ticker} is live and a licensed Shark Card distributor is connected. Until then you
                    can browse the list and set a goal on your dashboard.
                  </p>
                </Callout>
              )}
            </Section>

            <Section id="checkout" title={`Paying in ${brand.ticker}`}>
              <Steps
                items={[
                  {
                    title: "Get a quote",
                    body: (
                      <>
                        The server converts the card&apos;s SOL price into {brand.ticker} using live Jupiter market prices for
                        SOL and {brand.ticker}. Prices from pools with less than ${fmtInt(e.SHARK_MIN_LIQUIDITY_USD)} of
                        liquidity are refused, so a thin or manipulated market can&apos;t set your price.
                      </>
                    ),
                  },
                  {
                    title: `Pay within ${quoteMinutes} minutes`,
                    body: (
                      <>
                        The quote is locked for {quoteMinutes} minutes. Your wallet sends the exact {brand.ticker} amount to
                        the {brand.name} treasury. Each payment carries a unique reference key so it can be matched to your
                        order without guesswork.
                      </>
                    ),
                  },
                  {
                    title: "On-chain confirmation",
                    body: (
                      <>
                        The server looks up the transaction on Solana and only accepts it once it is{" "}
                        <strong>finalized</strong>. It checks the token, the recipient and the amount itself and never
                        trusts what a browser or wallet displays.
                      </>
                    ),
                  },
                  {
                    title: "Delivery",
                    body: <>The order is sent to the fulfilment partner and your code appears on the order page when it&apos;s delivered.</>,
                  },
                ]}
              />
            </Section>

            <Section id="orders" title="Order statuses">
              <Table
                head={["Status", "Meaning"]}
                rows={[
                  ["Reserved", "Payment confirmed; the card is held for you and being ordered."],
                  ["Pending delivery", "The fulfilment partner accepted the order and is issuing the code."],
                  ["Completed", "Your code is ready on the order page. It is stored encrypted."],
                  ["Needs reconciliation", "The partner didn't answer clearly. We check again automatically. You are never charged twice."],
                  ["Reversed", "The order failed or was voided. The payment is marked for refund."],
                ]}
              />
            </Section>

            <Section id="refunds" title="Refunds">
              <p>A payment is marked for refund to the wallet that sent it when:</p>
              <ul>
                <li>less {brand.ticker} arrived than the quote asked for,</li>
                <li>the payment arrived after the quote expired (a one-minute grace period applies), or</li>
                <li>the card became unavailable or the order failed before delivery.</li>
              </ul>
              <p>
                Refunds go back in {brand.ticker} to the sending wallet. A code that was already delivered and shown to you
                can&apos;t be refunded.
              </p>
            </Section>

            <Section id="redeeming" title="Redeeming your code">
              <ul>
                <li>
                  <strong>PlayStation:</strong> PlayStation Store → your profile → Redeem codes.
                </li>
                <li>
                  <strong>Xbox:</strong> Microsoft Store → Redeem a code, or <Code>redeem.microsoft.com</Code>.
                </li>
                <li>
                  <strong>PC:</strong> redeem in the store the code was issued for (Rockstar Games Launcher, Steam or Epic).
                </li>
              </ul>
              <p>
                GTA$ appears in GTA Online after you redeem. Signing in to {brand.name} with Steam or Microsoft proves your
                account, not that you own the game. Make sure you own GTA Online on the platform you pick.
              </p>
            </Section>

            {/* ------------------------------------------------ Account */}
            <Section id="sign-in" eyebrow="Your account" title="Signing in">
              <p>
                You sign in with an account you already have{signIn.length ? `: ${signIn.join(", ")}` : ""}. We receive only
                a stable account ID and, where offered, your display name and avatar. Tokens from these providers are used
                once to confirm who you are and aren&apos;t kept.
              </p>
              <p>
                You can connect several sign-in methods to the same {brand.name} account on the{" "}
                <Link href="/app/accounts">Linked accounts</Link> page, so losing one never locks you out.
              </p>
            </Section>

            <Section id="wallets" title="Linking wallets">
              <p>
                Linking proves a Solana wallet is yours by signing a short text message. The message names this website, has
                a unique code and expires after 5 minutes, so it can&apos;t be reused anywhere else.
              </p>
              <Callout tone="ok" title="A signature is not a transaction">
                <p>
                  Signing the message can&apos;t move tokens, approve spending or cost a fee. If your wallet ever asks you to
                  approve a <em>transaction</em> while linking, reject it. That isn&apos;t us.
                </p>
              </Callout>
              <ul>
                <li>A wallet can be linked to one account at a time.</li>
                <li>
                  After a wallet is unlinked, it can&apos;t be linked to a different account for 7 days. This protects you
                  if someone gets into your account and tries to move your wallet.
                </li>
                <li>Linking only affects what your dashboard shows. Payouts go to holder wallets whether they&apos;re linked or not.</li>
              </ul>
            </Section>

            <Section id="wallet-pass" title="Apple Wallet pass">
              <p>
                Members can add a {brand.name} membership pass to Apple Wallet. It shows your {brand.ticker} holdings and SOL
                rewards and updates automatically.
              </p>
              <Callout tone="warn" title="Not a payment card">
                <p>
                  The pass is not an Apple Pay card, holds no money and can&apos;t be used to pay or redeem anything. A
                  separate &ldquo;Pay with {brand.name}&rdquo; card is planned and would need a regulated card-issuing partner.
                  It isn&apos;t live.
                </p>
              </Callout>
            </Section>

            <Section id="recovery" title="Recovery codes">
              <p>
                Generate recovery codes on the Linked accounts page and store them somewhere safe and offline. Each code
                signs you in once if you lose access to every sign-in method. We only store a hashed version, so we
                can&apos;t show them to you again.
              </p>
            </Section>

            {/* ------------------------------------------------ Trust */}
            <Section id="transparency" eyebrow="Trust" title="Transparency & verifying">
              <p>
                The <Link href="/app/transparency">Transparency report</Link> shows the totals received, credited and paid to
                holders, every recent payout run, and recent payouts with their transaction signatures.
              </p>
              <p>You don&apos;t have to trust us. To check a payout yourself:</p>
              <ol className="list-decimal pl-5">
                <li>Open a payout&apos;s transaction signature on Solscan.</li>
                <li>Confirm it was sent from the fee wallet to the holder wallets with the amounts listed.</li>
                <li>Open the fee wallet on Solscan to see every creator-fee claim and every payout in one history.</li>
              </ol>
              <p>
                Internally, every lamport is tracked in an append-only, double-entry ledger: entries can be added but never
                edited or deleted, and every movement must balance to zero.
              </p>
            </Section>

            <Section id="security" title="Security promises">
              <ul>
                <li>
                  <strong>No passwords.</strong> We never ask for Rockstar, Xbox, PlayStation, Steam or email passwords.
                </li>
                <li>
                  <strong>No seed phrases.</strong> No one from {brand.name} will ever ask for your seed phrase or private
                  key. Anyone who does is a scammer.
                </li>
                <li>
                  <strong>The server decides.</strong> Balances, prices, payments and rewards are read from the blockchain
                  and market data by our servers, never from your browser.
                </li>
                <li>
                  <strong>Fails closed.</strong> If something required is missing or unreachable, such as prices, the
                  blockchain or a partner, the feature stops rather than guessing.
                </li>
                <li>
                  <strong>Secrets stay on the server.</strong> Keys and credentials are never sent to your browser. Delivered
                  codes are stored encrypted.
                </li>
              </ul>
            </Section>

            <Section id="risks" title="Risks & disclaimers">
              <ul>
                <li>
                  <strong>No guaranteed return.</strong> {brand.legal.rewards}
                </li>
                <li>
                  <strong>Token risk.</strong> {brand.ticker} is a volatile memecoin. Its price can fall to zero and
                  liquidity can disappear. Only use money you can afford to lose.
                </li>
                <li>
                  <strong>Platform risk.</strong> pump.fun can change its fee rules, Solana can be congested and partners can
                  run out of stock. Any of these can delay or reduce rewards and orders.
                </li>
                <li>
                  <strong>Not advice.</strong> Nothing here is investment, financial, legal or tax advice. You&apos;re
                  responsible for any taxes on rewards in your country.
                </li>
                <li>
                  <strong>Eligibility.</strong> You must be 18 or older and allowed to use crypto-asset services where you
                  live. See the <Link href="/terms">Terms of Service</Link>.
                </li>
              </ul>
            </Section>

            <Section id="roadmap" title="Roadmap">
              <Table
                head={["Feature", "Status"]}
                rows={[
                  ["Automatic SOL payouts to holders", blocker ? "Ready, starts at launch" : "Live"],
                  ["Shark Card checkout in $SHARK", live.liveFulfillment ? "Live" : "Waiting for a licensed distributor"],
                  ["Apple Wallet membership pass", live.applePass ? "Live" : "Planned"],
                  [`Pay with ${brand.name} (payment card)`, "Planned. Needs a regulated issuing partner"],
                  ["GTA VI rewards", "Not available until compatibility and fulfilment are verified"],
                ]}
              />
            </Section>

            <Section id="glossary" title="Glossary">
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-[180px_1fr]">
                {[
                  ["SOL", "The native coin of Solana. Rewards are paid in SOL."],
                  ["Lamport", "The smallest unit of SOL. 1 SOL = 1,000,000,000 lamports."],
                  ["Mint / contract address", `The unique on-chain address of ${brand.ticker}.`],
                  ["Creator fee", "The part of every pump.fun trade fee paid to the coin's creator wallet."],
                  ["Fee wallet", "The creator wallet that receives creator fees and sends holder payouts."],
                  ["Snapshot", `A reading of every holder's ${brand.ticker} balance, taken every ${snap} minutes.`],
                  ["Payout run", `The automatic process every ${every} minutes that claims, splits, credits and pays.`],
                  ["Float", "SOL kept in the fee wallet for network fees. Never shared as income."],
                  ["Finalized", "A Solana transaction that can no longer be rolled back."],
                  ["Solscan", "A public Solana block explorer for checking transactions and wallets."],
                ].map(([term, def]) => (
                  <div key={term} className="contents">
                    <dt className="font-semibold text-warm">{term}</dt>
                    <dd>{def}</dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Section id="help" title="Getting help">
              <p>
                Check the <Link href="/#faq">FAQ</Link> first. For anything else, send <Contact />. Include your order ID or
                transaction signature if it&apos;s about a payment, but <strong>never</strong> your seed phrase, private key or
                passwords.
              </p>
            </Section>
          </div>

          <footer className="mt-20 flex flex-wrap gap-x-6 border-t border-line pt-4 text-sm text-muted">
            <Link href="/" className="inline-flex min-h-11 items-center hover:text-warm">Home</Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-warm">Terms of Service</Link>
            <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-warm">Privacy Policy</Link>
            <span className="mt-2 w-full text-xs">{brand.legal.independence}</span>
          </footer>
        </article>
      </div>
    </main>
  );
}
