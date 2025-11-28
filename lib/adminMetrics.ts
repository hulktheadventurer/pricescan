import { supabaseAdmin } from "./supabaseServer";

export type AdminMetrics = {
  total_tracked_products: number;
  users_count: number;
  users_muted: number;
  snapshots_24h: number;
  notifications_today: number;
  last_fetch_time: string | null;
  last_digest_time: string | null;
};

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const now = new Date();
  const dayAgoIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const todayIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
  ).toISOString();

  const [
    trackedCount,
    usersCount,
    mutedCount,
    snaps24h,
    notiToday,
    lastFetch,
    lastDigest,
  ] = await Promise.all([
    supabaseAdmin.from("tracked_products").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("users").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("users").select("id", { count: "exact", head: true }).eq("is_email_muted", true),
    supabaseAdmin.from("price_snapshots").select("id", { count: "exact", head: true }).gte("seen_at", dayAgoIso),
    supabaseAdmin.from("notifications").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
    supabaseAdmin.from("price_snapshots").select("seen_at").order("seen_at", { ascending: false }).limit(1),
    supabaseAdmin.from("notifications").select("sent_at").eq("kind", "digest").order("sent_at", { ascending: false }).limit(1),
  ]);

  return {
    total_tracked_products: trackedCount.count ?? 0,
    users_count: usersCount.count ?? 0,
    users_muted: mutedCount.count ?? 0,
    snapshots_24h: snaps24h.count ?? 0,
    notifications_today: notiToday.count ?? 0,
    last_fetch_time: lastFetch.data?.[0]?.seen_at ?? null,
    last_digest_time: lastDigest.data?.[0]?.sent_at ?? null,
  };
}
