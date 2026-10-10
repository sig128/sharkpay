import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brand } from "@/config/brand";

export const alt = `${brand.name}: token-funded rewards for GTA Online Shark Cards`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fontFile = (pkg: string, file: string) => readFile(join(process.cwd(), "node_modules/@fontsource", pkg, "files", file));

export default async function Image() {
  const [display, mono] = await Promise.all([
    fontFile("barlow-condensed", "barlow-condensed-latin-800-normal.woff"),
    fontFile("ibm-plex-mono", "ibm-plex-mono-latin-500-normal.woff"),
  ]);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background:
            "radial-gradient(60% 70% at 78% 100%, rgba(255,136,107,0.45), transparent 70%), radial-gradient(50% 60% at 20% 100%, rgba(255,78,174,0.3), transparent 70%), #080A12",
          color: "#FFF4EA",
          fontFamily: "Barlow Condensed",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 44, letterSpacing: 3 }}>
          <svg width="52" height="52" viewBox="0 0 100 100">
            <path d="M16 80 Q38 30 66 14 Q56 52 84 80 Z" fill="#FF4EAE" />
          </svg>
          {brand.name}
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 124, lineHeight: 0.9, textTransform: "uppercase" }}>
          <span>Your next upgrade.</span>
          <span style={{ backgroundImage: "linear-gradient(90deg, #FFE5A5, #FF886B, #FF4EAE)", backgroundClip: "text", color: "transparent" }}>
            Earned.
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: "IBM Plex Mono", fontSize: 22, color: "#B3B6C7" }}>
          <span style={{ color: "#FFF4EA" }}>Hold {brand.ticker} · Collect funded rewards · Redeem Shark Cards</span>
          <span>Independent rewards platform. Not affiliated with Rockstar Games or Take-Two Interactive.</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Barlow Condensed", data: display, weight: 800, style: "normal" },
        { name: "IBM Plex Mono", data: mono, weight: 500, style: "normal" },
      ],
    },
  );
}
