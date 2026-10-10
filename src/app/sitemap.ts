import type { MetadataRoute } from "next";
import { env } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const url = env().APP_URL.replace(/\/$/, "");
  return [
    { url: `${url}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${url}/login`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${url}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${url}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
