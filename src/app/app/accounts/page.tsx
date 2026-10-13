import type { Metadata } from "next";
import { requirePageSession } from "@/lib/server/guard";
import { listIdentities, recoveryCodeStatus, type IdentityRow } from "@/lib/server/auth/accounts";
import { isRecentlyAuthenticated } from "@/lib/server/auth/sessions";
import { gamingProviders } from "@/lib/server/auth/providers";
import { integrations } from "@/lib/server/env";
import { listWallets, maskAddress } from "@/lib/server/wallet/verify";
import { PageHeader, Panel } from "@/components/app/Page";
import { Badge } from "@/components/ui/Badges";
import { buttonClass } from "@/components/ui/Button";
import { EmailCodeForm, RecoveryCodes, SignOutEverywhere, UnlinkButton } from "@/components/app/AccountActions";
import { WalletLinker } from "@/components/app/WalletLinker";
import { AUTH_ERRORS } from "@/lib/client";
import { fmtDate, PLATFORM_LABEL } from "@/lib/format";

export const metadata: Metadata = { title: "Connected accounts" };

const PROVIDER_LABEL: Record<string, string> = {
  microsoft: "Microsoft account",
  xbox: "Xbox profile",
  steam: "Steam",
  google: "Google",
  x: "X",
  email: "Email",
};

function identityName(i: IdentityRow) {
  const claims = JSON.parse(i.claims || "{}") as Record<string, unknown>;
  if (i.provider === "email") return i.display_name ?? "Verified email";
  if (i.provider === "xbox") return (claims.gamertag as string) ?? i.display_name ?? "Verified profile";
  if (i.provider === "steam") return i.display_name ?? `Steam ID ••••${i.subject.slice(-4)}`;
  if (i.provider === "x" && typeof claims.username === "string") return `@${claims.username}`;
  return i.display_name ?? "Connected";
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { session, user } = await requirePageSession();
  const sp = await searchParams;
  const identities = listIdentities(user.id);
  const wallets = listWallets(user.id).map((w) => ({ id: w.id, address: maskAddress(w.address), verifiedAt: w.verified_at }));
  const recent = isRecentlyAuthenticated(session);
  const i = integrations();
  const providers = gamingProviders();
  const has = (p: string) => identities.some((x) => x.provider === p);
  const recovery = recoveryCodeStatus(user.id);

  const platformRows = [
    { id: "pc", verified: has("steam"), via: "Steam" },
    { id: "playstation", verified: false, via: null },
    { id: "xbox", verified: has("xbox"), via: "Xbox profile" },
  ].map((p) => ({
    ...p,
    status: p.verified ? "verified" : user.reward_platform === p.id ? "selected" : "none",
  }));

  const linkable = [
    !has("microsoft") && i.microsoft && { href: "/api/auth/microsoft/start?purpose=link", label: "Link Microsoft account" },
    has("microsoft") && !has("xbox") && i.xbox && { href: "/api/auth/xbox/start", label: "Verify Xbox profile" },
    !has("steam") && i.steam && { href: "/api/auth/steam/start?purpose=link", label: "Link Steam" },
    !has("google") && i.google && { href: "/api/auth/google/start?purpose=link", label: "Link Google" },
    !has("x") && i.x && { href: "/api/auth/x/start?purpose=link", label: "Link X" },
  ].filter(Boolean) as Array<{ href: string; label: string }>;

  const redirectProviders = { microsoft: i.microsoft, steam: i.steam, google: i.google, x: i.x } as Record<string, boolean>;
  const reauthOptions = identities
    .filter((x) => redirectProviders[x.provider])
    .map((x) => ({ href: `/api/auth/${x.provider}/start?purpose=reauth&returnTo=/app/accounts`, label: `Confirm with ${PROVIDER_LABEL[x.provider]}` }));

  const notice = sp.error
    ? { tone: "danger" as const, text: AUTH_ERRORS[sp.error] ?? AUTH_ERRORS.signin_failed }
    : sp.linked
      ? { tone: "mint" as const, text: `${PROVIDER_LABEL[sp.linked] ?? "Account"} connected.` }
      : sp.recovered
        ? { tone: "butter" as const, text: "Signed in with a recovery code. That code can't be used again. Consider generating a fresh set." }
        : null;

  return (
    <>
      <PageHeader eyebrow="Account" title="Connected accounts">
        Your membership has its own internal ID. Sign-in methods and wallets attach to it; they are never matched or
        merged by name or email.
      </PageHeader>

      {notice && (
        <p role={notice.tone === "danger" ? "alert" : "status"} className={`mb-6 rounded-2xl border p-4 text-sm ${notice.tone === "danger" ? "border-[#ff6b6b]/40 bg-[#ff6b6b]/10 text-[#ffb3b3]" : notice.tone === "mint" ? "border-mint/30 bg-mint/10 text-mint" : "border-butter/30 bg-butter/10 text-butter"}`}>
          {notice.text}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel title="Reward platform status" className="lg:col-span-7">
          <ul className="divide-y divide-line">
            {platformRows.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-semibold">{PLATFORM_LABEL[p.id]}</div>
                  <div className="text-xs text-muted">
                    {p.status === "verified"
                      ? `Verified through ${p.via}`
                      : p.id === "playstation"
                        ? "PlayStation sign-in — coming soon. You can still choose it as your reward platform."
                        : p.status === "selected"
                          ? "Chosen as your reward platform, not verified"
                          : "No verified account connected"}
                  </div>
                </div>
                {p.status === "verified" ? (
                  <Badge tone="mint">Verified account</Badge>
                ) : p.status === "selected" ? (
                  <Badge tone="butter">Selected platform</Badge>
                ) : (
                  <Badge>Not connected</Badge>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Steam proves a Steam account, not GTA ownership. Xbox verification proves an Xbox profile. Neither proves your
            Rockstar account.
          </p>
        </Panel>

        <Panel title="Security" className="lg:col-span-5" action={recent ? <Badge tone="mint">Recently confirmed</Badge> : undefined}>
          {recent ? (
            <p className="text-sm text-muted">You confirmed it&apos;s you in the last 10 minutes, so you can link or unlink accounts and wallets now.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted">Linking, unlinking and recovery codes need a fresh sign-in from the last 10 minutes.</p>
              {reauthOptions.map((o) => (
                <a key={o.href} href={o.href} className={buttonClass("secondary", "md", "w-full")}>
                  {o.label}
                </a>
              ))}
              {has("email") && <EmailCodeForm purpose="reauth" cta="Confirm with email code" devMode={i.emailDevOutbox} />}
            </div>
          )}
        </Panel>

        <Panel title="Sign-in methods" className="lg:col-span-7">
          <ul className="divide-y divide-line">
            {identities.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-semibold">{PROVIDER_LABEL[x.provider] ?? x.provider}</div>
                  <div className="truncate text-xs text-muted">
                    {identityName(x)} · connected {fmtDate(x.created_at)}
                  </div>
                </div>
                <UnlinkButton kind="identity" id={x.id} label={PROVIDER_LABEL[x.provider] ?? x.provider} disabled={!recent} />
              </li>
            ))}
          </ul>
          <div className="mt-5 space-y-3 border-t border-line pt-5">
            <h3 className="text-sm font-semibold">Add a sign-in method</h3>
            <div className="flex flex-wrap gap-2">
              {linkable.map((l) =>
                recent ? (
                  <a key={l.href} href={l.href} className={buttonClass("secondary", "sm")}>{l.label}</a>
                ) : (
                  <span key={l.href} className={buttonClass("secondary", "sm", "pointer-events-none opacity-50")} aria-disabled="true">{l.label}</span>
                ),
              )}
              {providers
                .filter((p) => p.availability === "coming_soon")
                .map((p) => (
                  <span key={p.id} className={buttonClass("ghost", "sm", "pointer-events-none opacity-60")} aria-disabled="true">
                    {p.label}
                  </span>
                ))}
            </div>
            {!has("email") && recent && <EmailCodeForm purpose="link" cta="Link email" devMode={i.emailDevOutbox} />}
          </div>
        </Panel>

        <Panel title="Solana wallets" className="lg:col-span-5">
          <WalletLinker wallets={wallets} canChange={recent} />
        </Panel>

        <Panel title="Account recovery" className="lg:col-span-7">
          <RecoveryCodes remaining={recovery.remaining ?? 0} total={recovery.total} canGenerate={recent} />
        </Panel>

        <Panel title="Sessions" className="lg:col-span-5">
          <p className="mb-4 text-sm text-muted">Sign out on this device, or end every session on every device.</p>
          <SignOutEverywhere />
        </Panel>
      </div>
    </>
  );
}
