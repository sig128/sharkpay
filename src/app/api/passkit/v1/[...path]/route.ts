import { NextResponse } from "next/server";
import { env, integrations } from "@/lib/server/env";
import {
  authenticatePassRequest,
  buildSignedPass,
  passModel,
  registerDevice,
  unregisterDevice,
  updatedSerials,
} from "@/lib/server/passes/pass";
import { one } from "@/lib/server/db";

/**
 * Apple Wallet web service (PassKit). Apple calls these with
 * `Authorization: ApplePass <authenticationToken>`:
 *   POST/DELETE /v1/devices/{device}/registrations/{passTypeId}/{serial}
 *   GET         /v1/devices/{device}/registrations/{passTypeId}?passesUpdatedSince=
 *   GET         /v1/passes/{passTypeId}/{serial}
 *   POST        /v1/log
 */
type Ctx = { params: Promise<{ path: string[] }> };

const disabled = () => new NextResponse(null, { status: 503 });

function passTypeOk(passTypeId: string) {
  return passTypeId === env().APPLE_PASS_TYPE_ID;
}

export async function POST(req: Request, { params }: Ctx) {
  const { path } = await params;
  if (path[0] === "log") {
    const body = (await req.json().catch(() => ({}))) as { logs?: unknown[] };
    console.warn("PassKit device log entries:", Array.isArray(body.logs) ? body.logs.length : 0);
    return new NextResponse(null, { status: 200 });
  }
  if (!integrations().applePass) return disabled();
  const [kind, device, reg, passTypeId, serial] = path;
  if (kind !== "devices" || reg !== "registrations" || !serial || !passTypeOk(passTypeId)) {
    return new NextResponse(null, { status: 404 });
  }
  if (!authenticatePassRequest(serial, req.headers.get("authorization"))) return new NextResponse(null, { status: 401 });
  const { pushToken } = (await req.json().catch(() => ({}))) as { pushToken?: string };
  if (!pushToken || pushToken.length > 200) return new NextResponse(null, { status: 400 });
  const result = registerDevice(device, passTypeId, serial, pushToken);
  return new NextResponse(null, { status: result === "created" ? 201 : 200 });
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!integrations().applePass) return disabled();
  const [kind, device, reg, passTypeId, serial] = (await params).path;
  if (kind !== "devices" || reg !== "registrations" || !serial || !passTypeOk(passTypeId)) {
    return new NextResponse(null, { status: 404 });
  }
  if (!authenticatePassRequest(serial, req.headers.get("authorization"))) return new NextResponse(null, { status: 401 });
  unregisterDevice(device, passTypeId, serial);
  return new NextResponse(null, { status: 200 });
}

export async function GET(req: Request, { params }: Ctx) {
  if (!integrations().applePass) return disabled();
  const path = (await params).path;
  if (path[0] === "devices" && path[2] === "registrations" && path.length === 4) {
    const [, device, , passTypeId] = path;
    if (!passTypeOk(passTypeId)) return new NextResponse(null, { status: 404 });
    const since = Number(new URL(req.url).searchParams.get("passesUpdatedSince") ?? 0) || 0;
    const { serials, lastUpdated } = updatedSerials(device, passTypeId, since);
    if (serials.length === 0) return new NextResponse(null, { status: 204 });
    return NextResponse.json({ serialNumbers: serials, lastUpdated });
  }
  if (path[0] === "passes" && path.length === 3) {
    const [, passTypeId, serial] = path;
    if (!passTypeOk(passTypeId)) return new NextResponse(null, { status: 404 });
    const auth = authenticatePassRequest(serial, req.headers.get("authorization"));
    if (!auth) return new NextResponse(null, { status: 401 });
    const model = passModel(auth.realm, auth.user_id);
    const ims = req.headers.get("if-modified-since");
    if (ims && Date.parse(ims) >= Math.floor(model.updatedAt / 1000) * 1000) return new NextResponse(null, { status: 304 });
    const token = req.headers.get("authorization")!.slice(10).trim();
    const exists = one(`SELECT 1 FROM passes WHERE serial = ?`, serial);
    if (!exists) return new NextResponse(null, { status: 404 });
    const buffer = await buildSignedPass(auth.realm, auth.user_id, token);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.apple.pkpass",
        "last-modified": new Date(model.updatedAt).toUTCString(),
      },
    });
  }
  return new NextResponse(null, { status: 404 });
}
