import type { Metadata, Viewport } from "next";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "@fontsource-variable/manrope";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { brand } from "@/config/brand";
import { env } from "@/lib/server/env";

export function generateMetadata(): Metadata {
  const title = `${brand.name} — Token-funded GTA Online rewards`;
  const description = `${brand.tagline} ${brand.legal.independence}`;
  return {
    metadataBase: new URL(env().APP_URL),
    title: { default: title, template: `%s · ${brand.name}` },
    description,
    applicationName: brand.name,
    openGraph: { type: "website", siteName: brand.name, title, description, locale: "en_US", url: "/" },
    twitter: { card: "summary_large_image", title, description, site: brand.social.x.handle, creator: brand.social.x.handle },
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#080A12",
  width: "device-width",
  initialScale: 1,
};

/**
 * Runs before paint: if the opening sequence already played in this tab, or
 * the page isn't the landing page, skip it so it never replays on navigation.
 */
const introScript = `try{var h=document.documentElement;h.classList.add("js");if(location.pathname!=="/"||sessionStorage.getItem("sc-intro")){h.dataset.intro="skip";h.dataset.revealed="1"}}catch(e){document.documentElement.dataset.revealed="1"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: introScript }} />
        <noscript>
          <style>{`.loader{display:none}.reveal-up,.split-char,.wipe-in,.retro-sun,.fill-reveal{opacity:1!important;transform:none!important;filter:none!important;clip-path:none!important}`}</style>
        </noscript>
      </head>
      <body className="min-h-dvh bg-midnight text-warm antialiased">{children}</body>
    </html>
  );
}
