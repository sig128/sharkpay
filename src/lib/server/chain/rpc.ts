import { env } from "../env";
import { AppError } from "../errors";

export type Rpc = (method: string, params: unknown[]) => Promise<unknown>;

/** Read-only JSON-RPC client. Nothing here signs or submits transactions. */
export function solanaRpc(fetchImpl: typeof fetch = fetch): Rpc {
  return async (method, params) => {
    let body: { result?: unknown; error?: unknown };
    try {
      const res = await fetchImpl(env().SOLANA_RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      body = await res.json();
    } catch {
      throw new AppError("chain_unavailable", "We couldn't reach Solana. Nothing was changed; check again shortly.", 503);
    }
    if (body.error) throw new AppError("chain_unavailable", "Solana returned an error. Check again shortly.", 503);
    return body.result;
  };
}

export type AccountKey = string | { pubkey: string; signer?: boolean };

export interface ParsedTx {
  blockTime: number | null;
  meta: {
    err: unknown;
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: Array<{ accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } }>;
    postTokenBalances?: Array<{ accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } }>;
    loadedAddresses?: { writable?: string[]; readonly?: string[] };
  } | null;
  transaction: { message: { accountKeys: AccountKey[] } };
}

export function getFinalizedTransaction(rpc: Rpc, signature: string) {
  return rpc("getTransaction", [
    signature,
    { commitment: "finalized", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
  ]) as Promise<ParsedTx | null>;
}
