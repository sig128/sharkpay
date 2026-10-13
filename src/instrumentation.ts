export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { startPayoutScheduler } = await import("./lib/server/rewards/scheduler");
  try {
    startPayoutScheduler();
  } catch (err) {
    console.error("[payouts] scheduler did not start:", (err as Error).message);
  }
}
