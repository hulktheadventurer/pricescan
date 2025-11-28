// lib/adapters/base.js

// Shared offer object structure
export class Offer {
  constructor({ sku, title, url, price, currency, seller, image }) {
    this.sku = sku;
    this.title = title;
    this.url = url;
    this.price = price;
    this.currency = currency;
    this.seller = seller;
    this.image = image;
  }
}

// Base class all adapters must follow
export class PriceSourceAdapter {
  resolve(query) {
    throw new Error("Not implemented");
  }

  affiliateLink(url) {
    return url;
  }

  limits() {
    return { rpm: 30, burst: 10 };
  }
}

// CJS support (cron scripts, pm2)
module.exports = {
  Offer,
  PriceSourceAdapter,
};
