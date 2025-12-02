// lib/adapters/ebay/resolve.cjs

const { createClient } = require("@supabase/supabase-js");

class EbayAdapter {
  constructor() {
    this.marketplace = "EBAY_GB";

    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }

  async getAccessToken() {
    const { data, error } = await this.supabase
      .from("system_settings")
      .select("value")
      .eq("key", "EBAY_ACCESS_TOKEN")
      .single();

    if (error || !data?.value) {
      throw new Error("No eBay access token found in Supabase");
    }

    return data.value;
  }

  extractLegacyId(link) {
    const cleaned = link.split("?")[0];
    const m = cleaned.match(/\/itm\/(?:[^/]+\/)?(\d{9,12})/);
    return m ? m[1] : null;
  }

  toOffer(item) {
    const raw = item?.price?.value ?? item?.price;

    return {
      title: item?.title || "Unknown eBay Item",
      price: raw ? Number(raw) : 0,
      currency: item?.price?.currency || "GBP"
    };
  }

  async fetchByLegacyId(id, token) {
    const url = `https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${id}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": this.marketplace
      },
    });

    if (res.status === 404) return null;

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`eBay legacy lookup failed: ${txt}`);
    }

    return this.toOffer(await res.json());
  }

  async fetchBySearch(q, token) {
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=1`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": this.marketplace
      },
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Search failed: ${txt}`);
    }

    const data = await res.json();
    const item = data?.itemSummaries?.[0];
    if (!item) return null;

    return this.toOffer({
      title: item.title,
      price: item.price
    });
  }

  async resolve(input) {
    const token = await this.getAccessToken();

    const legacyId = this.extractLegacyId(input);
    if (legacyId) {
      const found = await this.fetchByLegacyId(legacyId, token);
      if (found) return found;

      const fallback = await this.fetchBySearch(legacyId, token);
      if (fallback) return fallback;

      throw new Error(`Legacy ID ${legacyId} not found`);
    }

    const fallback = await this.fetchBySearch(input, token);
    if (fallback) return fallback;

    throw new Error("Unable to resolve eBay item");
  }
}

module.exports = EbayAdapter;
