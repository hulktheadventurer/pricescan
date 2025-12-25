import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url));
}
