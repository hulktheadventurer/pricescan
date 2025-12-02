// app/api/ebay-callback/route.ts
import { NextRequest, NextResponse } from "next/server";

export function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "No code received" }, { status: 400 });
  }

  return NextResponse.json({
    message: "OK",
    code,
    note: "Paste this into EBAY_AUTH_CODE in .env.local",
  });
}
