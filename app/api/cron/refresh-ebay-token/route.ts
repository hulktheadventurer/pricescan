import { NextResponse } from "next/server";

export async function GET() {
  try {
    console.log("🔄 Cron: Refreshing eBay token...");

    const basicAuth = Buffer.from(
      `${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`
    ).toString("base64");

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.EBAY_REFRESH_TOKEN!,
      scope: "https://api.ebay.com/oauth/api_scope",
    });

    const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("❌ Refresh FAILED:", data);
      return NextResponse.json({ error: "Refresh failed", data }, { status: 500 });
    }

    // UPDATE the Vercel environment variable via API
    await fetch(
      `https://api.vercel.com/v10/projects/${process.env.VERCEL_PROJECT_ID}/env`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: "EBAY_ACCESS_TOKEN",
          value: data.access_token,
          target: ["production"],
        }),
      }
    );

    return NextResponse.json({
      success: true,
      access_token: "UPDATED",
      expires_in: data.expires_in,
    });
  } catch (e: any) {
    console.error("❌ refresh-ebay-token failed:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
