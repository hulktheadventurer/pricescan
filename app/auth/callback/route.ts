import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  try {
    if (code) {
      const supabase = createRouteHandlerClient({ cookies });
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("❌ exchangeCodeForSession error:", error);
        return NextResponse.redirect(
          new URL(`/?auth_error=${encodeURIComponent(error.message)}`, requestUrl.origin)
        );
      }
    }
  } catch (e: any) {
    console.error("❌ auth callback exception:", e);
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent(e?.message || "callback_failed")}`, requestUrl.origin)
    );
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin));
}
