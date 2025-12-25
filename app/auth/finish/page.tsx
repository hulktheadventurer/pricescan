"use client";

import { useEffect } from "react";

export default function AuthFinishPage() {
  useEffect(() => {
    const url = new URL(window.location.href);

    // Supabase sends ?code=... (PKCE) in the URL
    const code = url.searchParams.get("code");

    // Notify other tabs ASAP (so old tab refreshes products)
    try {
      const bc = new BroadcastChannel("pricescan-auth");
      bc.postMessage({ type: "SIGNED_IN" });
      bc.close();
    } catch {}

    window.dispatchEvent(new CustomEvent("pricescan-auth-signed-in"));

    // Now send this tab to the server route that actually exchanges the code + sets cookies
    // (Your existing route.ts at /auth/callback will handle it and redirect to "/")
    if (code) {
      window.location.replace(`/auth/callback?code=${encodeURIComponent(code)}`);
      return;
    }

    // If no code present, just go home
    window.location.replace("/");
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 text-gray-600">
      Signing you in…
    </div>
  );
}
