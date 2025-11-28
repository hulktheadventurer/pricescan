import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No code found in redirect URL." });
  }

  return NextResponse.json({
    message: "✅ eBay authorization code received!",
    code,
    note: "Copy this 'code' value into your .env.local as EBAY_AUTH_CODE within 5 minutes."
  });
}
