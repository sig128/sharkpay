import { integrations } from "../env";

/**
 * Gaming identity providers as the UI should present them. Labels follow what
 * actually works: "Xbox" only appears when the Xbox services flow is enabled.
 */
export type ProviderAvailability = "live" | "unavailable" | "coming_soon";

export interface GamingProviderInfo {
  id: "microsoft" | "playstation" | "steam";
  platform: "xbox" | "playstation" | "pc";
  label: string;
  detail: string;
  availability: ProviderAvailability;
  verifies: string;
}

/**
 * PlayStation adapter boundary. Real PSN sign-in requires official partner
 * access (https://partners.playstation.net/). There is no public, unrestricted
 * PSN OAuth integration, so this stays disabled until an approved integration
 * and credentials exist. Selecting PlayStation or typing a PSN name is never
 * treated as account verification.
 */
export interface PlayStationIdentityProvider {
  readonly enabled: false;
  readonly reason: string;
}

export const playStationProvider: PlayStationIdentityProvider = {
  enabled: false,
  reason: "Requires approved PlayStation Partners access and credentials",
};

export interface SocialProviderInfo {
  id: "google" | "x";
  label: string;
  detail: string;
  availability: ProviderAvailability;
}

/** General-purpose sign-in. These prove an account with that provider, not any gaming platform. */
export function socialProviders(): SocialProviderInfo[] {
  const i = integrations();
  return [
    {
      id: "google",
      label: "Continue with Google",
      detail: i.google ? "Name and profile picture only" : "Not configured",
      availability: i.google ? "live" : "unavailable",
    },
    {
      id: "x",
      label: "Continue with X",
      detail: i.x ? "Read-only profile. We never post for you" : "Not configured",
      availability: i.x ? "live" : "unavailable",
    },
  ];
}

export function gamingProviders(): GamingProviderInfo[] {
  const i = integrations();
  return [
    {
      id: "microsoft",
      platform: "xbox",
      label: i.xbox ? "Continue with Xbox" : "Continue with Microsoft",
      detail: i.xbox
        ? "Microsoft account sign-in, then Xbox profile verification"
        : i.microsoft
          ? "Personal Microsoft account. Xbox profile verification is not enabled yet"
          : "Not configured on this server",
      availability: i.microsoft ? "live" : "unavailable",
      verifies: i.xbox ? "Microsoft account + gamertag/XUID after linking" : "Microsoft account only",
    },
    {
      id: "playstation",
      platform: "playstation",
      label: "PlayStation sign-in — coming soon",
      detail: "Use email sign-in and choose PlayStation as your reward platform",
      availability: "coming_soon",
      verifies: "Nothing yet",
    },
    {
      id: "steam",
      platform: "pc",
      label: "Continue with Steam",
      detail: i.steam ? "Steam OpenID. Proves your Steam account, not game ownership" : "Not enabled on this server",
      availability: i.steam ? "live" : "unavailable",
      verifies: "Steam ID only",
    },
  ];
}
