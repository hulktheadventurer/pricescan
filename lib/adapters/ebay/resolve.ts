import { getValidAccessToken } from "@/lib/ebay-auth";

export class EbayAdapter {
  marketplace: string;

  constructor() {
    this.marketplace = "EBAY_GB"; // Same as before
  }

  // Extract legacy ID from eBay URL
  extractLegacyId(link: string): string | null {
    const cleaned = link.split("?")[0];
    const m = cleaned.match(/\/itm\/(?:[^/]+\/)?(\d{9,12})/);
    return m ? m[1] : null;
  }

  // Convert raw API → internal format
  toOffer(item: any) {
    const raw = item?.price?.value ?? item?.price;
    return {
      title: item?.title || "Unknown eBay Item",
      price: raw ? Number(raw) : 0,
      currency: item?.price?.currency || "GBP",
    };
  }

  // Fetch using legacy ID
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

  // Fallback search
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

  // Main resolve
  async resolve(input: string) {
    // NEW: Get token from refresh flow — NOT from a file
    const token = await getValidAccessToken();

    // Try legacy ID
    const legacyId = this.extractLegacyId(input);
    if (legacyId) {
      const found = await this.fetchByLegacyId(legacyId, token);
      if (found) return found;

      const fallback = await this.fetchBySearch(legacyId, token);
      if (fallback) return fallback;

      throw new Error(`Legacy ID ${legacyId} not found`);
    }

    // Fallback search
    const fallback = await this.fetchBySearch(input, token);
    if (fallback) return fallback;

    throw new Error("Unable to resolve eBay item");
  }
}

export default EbayAdapter;
