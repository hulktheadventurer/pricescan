// app/api/cron-refresh-ebay-token/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const EBAY_APP_ID = process.env.EBAY_APP_ID!;
const EBAY_CERT_ID = process.env.EBAY_CERT_ID!;
const EBAY_REFRESH_TOKEN = process.env.EBAY_REFRESH_TOKEN!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function GET() {
  try {
    if (!EBAY_APP_ID || !EBAY_CERT_ID || !EBAY_REFRESH_TOKEN) {
      console.error("Missing eBay env vars");
      return NextResponse.json(
        { ok: false, error: "Missing eBay env vars" },
        { status: 500 }
      );
    }

    const basicAuth = Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString(
      "base64"
    );

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: EBAY_REFRESH_TOKEN,
      // scope is usually optional for refresh_token, but safe to include:
      scope:
        "https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/buy.browse",
    });

    const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const json = await res.json();

    if (!res.ok) {
      console.error("eBay token refresh failed:", json);
      return NextResponse.json(
        { ok: false, error: "eBay refresh failed", details: json },
        { status: 500 }
      );
    }

    const { access_token, expires_in } = json;
    if (!access_token) {
      console.error("No access_token in eBay response:", json);
      return NextResponse.json(
        { ok: false, error: "No access_token in eBay response" },
        { status: 500 }
      );
    }

    // Store access token in Supabase system_settings
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        [
          {
            key: "EBAY_ACCESS_TOKEN",
            value: access_token,
          },
        ],
        { onConflict: "key" }
      );

    if (error) {
      console.error("Failed to save EBAY_ACCESS_TOKEN:", error);
      return NextResponse.json(
        { ok: false, error: "Failed to save EBAY_ACCESS_TOKEN" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "eBay access token refreshed",
      expires_in,
    });
  } catch (err: any) {
    console.error("cron-refresh-ebay-token error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
