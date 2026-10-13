import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { env } from "../env";
import { AppError } from "../errors";

/**
 * Everything the payout cycle needs from Solana. The live implementation signs
 * with the fee wallet key; tests pass a fake.
 */
export interface PayoutChain {
  feeWallet: string;
  /** Confirmed SOL balance of the fee wallet, lamports. */
  balance(): Promise<number>;
  /** Claims pump.fun creator fees into the fee wallet. Null when there was nothing to claim. */
  claimCreatorFees(mint: string): Promise<string | null>;
  /** Closes the fee wallet's wrapped-SOL account so AMM creator fees become plain SOL. */
  unwrapWsol(): Promise<string | null>;
  /** Token holders: wallet owner → raw balance, PDAs (curve, pools) already removed. */
  holders(mint: string): Promise<Map<string, bigint>>;
  /** Builds and signs one SOL transfer transaction. Nothing is broadcast. */
  signTransfers(recipients: Array<{ wallet: string; lamports: number }>): Promise<SignedTransfer>;
  /** Broadcasts a signed transaction. Throws if the RPC rejects it (it then never lands). */
  send(serialized: Uint8Array): Promise<void>;
  statuses(signatures: string[]): Promise<Array<"confirmed" | "failed" | "unknown">>;
  blockHeight(): Promise<number>;
}

export interface SignedTransfer {
  signature: string;
  serialized: Uint8Array;
  lastValidBlockHeight: number;
}

/** System transfers per transaction; keeps the message under the 1232-byte limit. */
export const TRANSFERS_PER_TX = 18;

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGqPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ATA_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const NATIVE_MINT = new PublicKey("So11111111111111111111111111111111111111112");

/** Programs a pump.fun fee-claim transaction may call at the top level. */
const CLAIM_PROGRAMS = new Set([
  "ComputeBudget111111111111111111111111111111",
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P", // pump.fun bonding curve
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA", // PumpSwap AMM
  "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ", // pump fees
  ATA_PROGRAM_ID.toBase58(),
]);
/** SPL Token instructions allowed in a claim: CloseAccount (9), SyncNative (17). */
const CLAIM_TOKEN_IXS = new Set([9, 17]);
/** A claim may cost the fee wallet at most this much SOL (tx fee + account rent). */
const CLAIM_MAX_COST_LAMPORTS = 10_000_000;

export function parseSecretKey(raw: string): Keypair {
  const trimmed = raw.trim();
  let bytes: Uint8Array;
  try {
    bytes = trimmed.startsWith("[") ? Uint8Array.from(JSON.parse(trimmed) as number[]) : bs58.decode(trimmed);
  } catch {
    throw new AppError("not_configured", "FEE_WALLET_SECRET_KEY is not a base58 or JSON-array secret key", 500);
  }
  if (bytes.length !== 64) throw new AppError("not_configured", "FEE_WALLET_SECRET_KEY must be a 64-byte secret key", 500);
  return Keypair.fromSecretKey(bytes);
}

export function isWalletAddress(address: string) {
  try {
    return PublicKey.isOnCurve(new PublicKey(address).toBytes());
  } catch {
    return false;
  }
}

export function liveChain(): PayoutChain {
  const e = env();
  if (!e.FEE_WALLET_SECRET_KEY) throw new AppError("not_configured", "FEE_WALLET_SECRET_KEY is not set", 500);
  const signer = parseSecretKey(e.FEE_WALLET_SECRET_KEY);
  const owner = signer.publicKey;
  const conn = new Connection(e.SOLANA_RPC_URL, { commitment: "confirmed" });
  const priority = () => ComputeBudgetProgram.setComputeUnitPrice({ microLamports: e.PRIORITY_FEE_MICROLAMPORTS });

  async function signAndSend(instructions: TransactionInstruction[]) {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const message = new TransactionMessage({ payerKey: owner, recentBlockhash: blockhash, instructions }).compileToV0Message();
    const txn = new VersionedTransaction(message);
    txn.sign([signer]);
    const signature = await conn.sendRawTransaction(txn.serialize(), { maxRetries: 3 });
    await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    return signature;
  }

  function assertSafeClaim(txn: VersionedTransaction) {
    const keys = txn.message.staticAccountKeys;
    if (!keys[0]?.equals(owner)) throw new AppError("claim_rejected", "Claim transaction is not paid by the fee wallet", 502);
    for (const ix of txn.message.compiledInstructions) {
      const program = keys[ix.programIdIndex]?.toBase58();
      if (program && CLAIM_PROGRAMS.has(program)) continue;
      if ((program === TOKEN_PROGRAM_ID.toBase58() || program === TOKEN_2022_PROGRAM_ID.toBase58()) && CLAIM_TOKEN_IXS.has(ix.data[0])) {
        continue;
      }
      throw new AppError("claim_rejected", `Claim transaction calls an unexpected program (${program})`, 502);
    }
  }

  return {
    feeWallet: owner.toBase58(),

    balance: () => conn.getBalance(owner, "confirmed"),

    async claimCreatorFees(mint) {
      const res = await fetch(`${e.PUMP_FEES_API_URL}/agents/collect-fees`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mint, user: owner.toBase58(), encoding: "base64" }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { transaction?: string; creator?: string; usesSharingConfig?: boolean };
      if (body.usesSharingConfig) {
        throw new AppError("claim_rejected", "This coin uses a pump.fun fee-sharing config; claims are not handled here", 502);
      }
      if (body.creator && body.creator !== owner.toBase58()) {
        throw new AppError("claim_rejected", "FEE_WALLET_SECRET_KEY is not the creator wallet of TOKEN_MINT", 502);
      }
      if (!body.transaction) return null;
      const txn = VersionedTransaction.deserialize(Buffer.from(body.transaction, "base64"));
      assertSafeClaim(txn);
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
      txn.message.recentBlockhash = blockhash;
      const before = await conn.getBalance(owner, "confirmed");
      const sim = await conn.simulateTransaction(txn, {
        sigVerify: false,
        replaceRecentBlockhash: false,
        accounts: { encoding: "base64", addresses: [owner.toBase58()] },
      });
      if (sim.value.err) return null;
      const after = sim.value.accounts?.[0]?.lamports;
      if (typeof after !== "number" || after < before - CLAIM_MAX_COST_LAMPORTS) {
        throw new AppError("claim_rejected", "Claim transaction would take SOL out of the fee wallet", 502);
      }
      txn.sign([signer]);
      const signature = await conn.sendRawTransaction(txn.serialize(), { maxRetries: 3 });
      await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
      return signature;
    },

    async unwrapWsol() {
      const [ata] = PublicKey.findProgramAddressSync(
        [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), NATIVE_MINT.toBuffer()],
        ATA_PROGRAM_ID,
      );
      const info = await conn.getAccountInfo(ata, "confirmed");
      if (!info) return null;
      const close = new TransactionInstruction({
        programId: TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: ata, isSigner: false, isWritable: true },
          { pubkey: owner, isSigner: false, isWritable: true },
          { pubkey: owner, isSigner: true, isWritable: false },
        ],
        data: Buffer.from([9]),
      });
      return signAndSend([priority(), close]);
    },

    async holders(mint) {
      const programId = e.TOKEN_PROGRAM === "spl-token" ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
      const filters = [
        ...(e.TOKEN_PROGRAM === "spl-token" ? [{ dataSize: 165 }] : []),
        { memcmp: { offset: 0, bytes: mint } },
      ];
      const accounts = await conn.getParsedProgramAccounts(programId, { commitment: "confirmed", filters });
      const out = new Map<string, bigint>();
      for (const { account } of accounts) {
        const data = account.data as { parsed?: { type?: string; info?: { mint?: string; owner?: string; tokenAmount?: { amount?: string } } } };
        const info = data.parsed?.info;
        if (data.parsed?.type !== "account" || info?.mint !== mint || !info.owner) continue;
        const amount = BigInt(info.tokenAmount?.amount ?? "0");
        if (amount === 0n || !isWalletAddress(info.owner)) continue;
        out.set(info.owner, (out.get(info.owner) ?? 0n) + amount);
      }
      return out;
    },

    async signTransfers(recipients) {
      if (recipients.length === 0 || recipients.length > TRANSFERS_PER_TX) throw new Error("Bad transfer batch size");
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
      const instructions = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000 + 300 * recipients.length }),
        priority(),
        ...recipients.map((r) =>
          SystemProgram.transfer({ fromPubkey: owner, toPubkey: new PublicKey(r.wallet), lamports: r.lamports }),
        ),
      ];
      const message = new TransactionMessage({ payerKey: owner, recentBlockhash: blockhash, instructions }).compileToV0Message();
      const txn = new VersionedTransaction(message);
      txn.sign([signer]);
      return { signature: bs58.encode(txn.signatures[0]), serialized: txn.serialize(), lastValidBlockHeight };
    },

    async send(serialized) {
      await conn.sendRawTransaction(serialized, { maxRetries: 5 });
    },

    async statuses(signatures) {
      const { value } = await conn.getSignatureStatuses(signatures, { searchTransactionHistory: true });
      return value.map((s) => {
        if (!s) return "unknown";
        if (s.err) return "failed";
        return s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized" ? "confirmed" : "unknown";
      });
    },

    blockHeight: () => conn.getBlockHeight("confirmed"),
  };
}
