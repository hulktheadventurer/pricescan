// app/api/track/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getEbayAccessToken } from "@/lib/ebay-auth";

function extractId(input: string): string | null {
  if (!input) return null;

  // plain ID?
  if (/^\d{12,}$/.test(input)) return input;

  try {
    const url = new URL(input);
    const match = url.pathname.match(/(\d{12,})/);
    if (match) return match[1];
  } catch {}

  return null;
}

async function fetchItem(id: string) {
  const token = await getEbayAccessToken();

  const res = await fetch(
    `https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${id}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await res.json();

  return {
    title: data.title ?? null,
    price: data.price?.value ?? null,
    currency: data.price?.currency ?? null,
    raw: data,
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const input = url.searchParams.get("id") || url.searchParams.get("url");

  const id = extractId(input || "");
  if (!id) {
    return NextResponse.json({ error: "Invalid id/url" }, { status: 400 });
  }

  const item = await fetchItem(id);
  return NextResponse.json({ success: true, id, ...item });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const input = body.id || body.url;

  const id = extractId(input || "");
  if (!id) {
    return NextResponse.json({ error: "Invalid id/url" }, { status: 400 });
  }

  const item = await fetchItem(id);
  return NextResponse.json({ success: true, id, ...item });
}
