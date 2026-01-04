"use client";

import { useEffect } from "react";

export default function AuthFinishPage() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");

    // ✅ Notify other tabs ASAP so they refresh products/UI
    try {
      const bc = new BroadcastChannel("pricescan-auth");
      bc.postMessage({ type: "SIGNED_IN" });
      bc.close();
    } catch {}

    window.dispatchEvent(new CustomEvent("pricescan-auth-signed-in"));

    // ✅ Forward to server route that exchanges code + sets cookies
    if (code) {
      window.location.replace(`/auth/callback?code=${encodeURIComponent(code)}`);
      return;
    }

    window.location.replace("/");
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 text-gray-600">
      Signing you in…
    </div>
  );
}
