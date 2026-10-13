import { env } from "../env";
import { liveChain } from "../solana/chain";
import { payoutBlocker, runPayoutCycle, takeSnapshot } from "./autopay";

declare global {
  var __sharkPayoutTimers: NodeJS.Timeout[] | undefined;
}

/** Starts snapshot and payout timers in this server process. Assumes a single instance. */
export function startPayoutScheduler() {
  if (globalThis.__sharkPayoutTimers) return;
  const blocker = payoutBlocker();
  if (blocker) {
    console.info(`[payouts] automatic payouts are off. ${blocker}`);
    return;
  }
  const e = env();
  const chain = liveChain();
  const log = (label: string) => (err: unknown) => console.error(`[payouts] ${label} failed:`, (err as Error).message);

  const snapshot = () => takeSnapshot(chain).catch(log("snapshot"));
  const cycle = () =>
    runPayoutCycle(chain)
      .then((s) =>
        console.info(
          `[payouts] ${s.status}: income ${s.incomeLamports}, credited ${s.creditedLamports} to ${s.holders}, paid ${s.paidLamports} to ${s.paidWallets}. ${s.notes.join(" ")}`,
        ),
      )
      .catch(log("cycle"));

  const timers = [
    setInterval(snapshot, e.SNAPSHOT_INTERVAL_MINUTES * 60_000),
    setInterval(cycle, e.PAYOUT_INTERVAL_MINUTES * 60_000),
    setTimeout(snapshot, 10_000),
  ];
  for (const t of timers) t.unref();
  globalThis.__sharkPayoutTimers = timers;
  console.info(`[payouts] fee wallet ${chain.feeWallet}; paying holders every ${e.PAYOUT_INTERVAL_MINUTES} minutes.`);
}
