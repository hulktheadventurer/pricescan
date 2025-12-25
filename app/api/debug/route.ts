import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function projectRefFromUrl(u?: string) {
  if (!u) return null;
  try {
    const host = new URL(u).host; // xxx.supabase.co
    return host.split(".")[0] || null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const user = userData?.user ?? null;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const projectRef = projectRefFromUrl(supabaseUrl);

    // Admin count (bypasses RLS)
    let adminCount: number | null = null;
    let adminError: any = null;

    if (user?.id) {
      const { count, error } = await supabaseAdmin
        .from("tracked_products")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      adminCount = count ?? 0;
      adminError = error ?? null;
    }

    // Session count (RLS applies)
    let sessionCount: number | null = null;
    let sessionError: any = null;

    if (user?.id) {
      const { count, error } = await supabase
        .from("tracked_products")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      sessionCount = count ?? 0;
      sessionError = error ?? null;
    }

    return NextResponse.json({
      ok: true,
      projectRef,
      supabaseUrl,
      user: user ? { id: user.id, email: user.email } : null,
      userError: userErr ? { message: userErr.message } : null,
      adminCount,
      adminError: adminError
        ? { message: adminError.message, details: adminError.details, hint: adminError.hint }
        : null,
      sessionCount,
      sessionError: sessionError
        ? { message: sessionError.message, details: sessionError.details, hint: sessionError.hint }
        : null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "debug_failed" },
      { status: 500 }
    );
  }
}

// ✅ keep TS happy; guarantees this file is treated as a module even in weird paste cases
export {};
