import type { MetadataRoute } from "next";
import { env } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const url = env().APP_URL.replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/app/", "/api/", "/onboarding"] },
    sitemap: `${url}/sitemap.xml`,
  };
}
