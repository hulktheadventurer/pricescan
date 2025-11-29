// lib/adapters/ebay/resolve.ts

export default class EbayAdapter {
  marketplace = "EBAY_GB";

  constructor() {}

  // Get access token from environment
  async getAccessToken(): Promise<string> {
    const token = process.env.EBAY_ACCESS_TOKEN;

    if (!token || token.trim() === "") {
      throw new Error("Failed to get eBay access token");
    }

    return token;
  }

  extractLegacyId(link: string): string | null {
    const cleaned = link.split("?")[0];
    const m = cleaned.match(/\/itm\/(?:[^/]+\/)?(\d{9,12})/);
    return m ? m[1] : null;
  }

  toOffer(item: any) {
    const raw = item?.price?.value ?? item?.price;
    return {
      title: item?.title || "Unknown eBay Item",
      price: raw ? Number(raw) : 0,
      currency: item?.price?.currency || "GBP",
    };
  }

  async fetchByLegacyId(id: string, token: string) {
    const url = `https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${id}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": this.marketplace,
      },
    });

    if (res.status === 404) return null;

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`eBay legacy lookup failed: ${txt}`);
    }

    return this.toOffer(await res.json());
  }

  async fetchBySearch(q: string, token: string) {
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(
      q
    )}&limit=1`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": this.marketplace,
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
      price: item.price,
    });
  }

  // Main resolver
  async resolve(input: string) {
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
