import { NextResponse } from "next/server";
import { api, requireSession } from "@/lib/server/http";
import { buildSignedPass, issuePassRecord } from "@/lib/server/passes/pass";

/** Signed .pkpass download. Returns 503 until Apple pass credentials are configured. */
export const GET = api(async () => {
  const session = await requireSession();
  const { token } = issuePassRecord(session.realm, session.userId);
  const buffer = await buildSignedPass(session.realm, session.userId, token);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.apple.pkpass",
      "content-disposition": 'attachment; filename="membership.pkpass"',
      "cache-control": "no-store",
    },
  });
});
