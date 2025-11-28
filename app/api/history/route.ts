import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("product_id");

  const { data, error } = await supabase
    .from("price_snapshots")
    .select("price, currency, seen_at")
    .eq("product_id", id)
    .order("seen_at", { ascending: true });

  if (error) return NextResponse.json({ error });

  return NextResponse.json({ snapshots: data });
}
