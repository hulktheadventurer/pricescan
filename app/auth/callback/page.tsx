"use client";

import { useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function AuthCallbackPage() {
  const supabase = createClientComponentClient();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // Ensure client session has caught up (server route set cookies already)
        await supabase.auth.getSession();

        // Tell other tabs to refresh
        try {
          const bc = new BroadcastChannel("pricescan-auth");
          bc.postMessage({ type: "SIGNED_IN" });
          bc.close();
        } catch {}

        window.dispatchEvent(new CustomEvent("pricescan-auth-signed-in"));

        // go home
        window.location.replace("/");
      } catch {
        window.location.replace("/?auth_error=callback_failed");
      }
    }

    if (!cancelled) run();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 text-gray-600">
      Signing you in…
    </div>
  );
}
