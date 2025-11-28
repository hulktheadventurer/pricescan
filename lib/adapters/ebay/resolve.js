import fs from "fs";
import path from "path";

export class EbayAdapter {
  constructor() {
    this.tokenPath = path.resolve(process.cwd(), "ebay-token.json");
    this.marketplace = "EBAY_GB";
  }

  async getAccessToken() {
    if (!fs.existsSync(this.tokenPath)) {
      throw new Error("Missing ebay-token.json");
    }

    const data = JSON.parse(fs.readFileSync(this.tokenPath, "utf8"));
    if (!data.access_token) throw new Error("Missing access_token");
    return data.access_token;
  }

  extractLegacyId(url) {
    const base = url.split("?")[0];
    const match = base.match(/\/itm\/(?:[^/]+\/)?(\d{9,12})/);
    return match ? match[1] : null;
  }

  toOffer(item) {
    const raw = item?.price?.value ?? item?.price ?? 0;
    return {
      title: item?.title || "Unknown eBay Item",
      price: Number(raw),
      currency: item?.price?.currency || "GBP",
    };
  }

  async fetchByLegacyId(id, token) {
    const url = `https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${id}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": this.marketplace,
      },
    });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await res.text());

    return this.toOffer(await res.json());
  }

  async fetchBySearch(q, token) {
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

    if (!res.ok) throw new Error(await res.text());

    const data = await res.json();
    const item = data?.itemSummaries?.[0];
    if (!item) return null;

    return this.toOffer({ title: item.title, price: item.price });
  }

  async resolve(input) {
    const token = await this.getAccessToken();

    const legacyId = this.extractLegacyId(input);
    if (legacyId) {
      const hit = await this.fetchByLegacyId(legacyId, token);
      if (hit) return hit;

      const fallback = await this.fetchBySearch(legacyId, token);
      if (fallback) return fallback;

      throw new Error(`Legacy ID ${legacyId} not found`);
    }

    const fallback = await this.fetchBySearch(input, token);
    if (fallback) return fallback;

    throw new Error("Unable to resolve eBay item");
  }
}

export default EbayAdapter;
