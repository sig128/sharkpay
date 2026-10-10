import { NextResponse } from "next/server";
import { api } from "@/lib/server/http";

/** Credit redemptions were removed. Shark Cards are paid in $SHARK. */
export const POST = api(async () => {
  return NextResponse.json(
    { error: { code: "gone", message: "Reward credits are gone. Pay for Shark Cards with $SHARK." } },
    { status: 410 },
  );
});
