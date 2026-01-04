// lib/adapters/base.js

export class PriceSourceAdapter {
  resolve(query) {
    throw new Error("resolve() not implemented");
  }

  affiliateLink(url) {
    return url;
  }

  limits() {
    return { rpm: 30, burst: 10 };
  }
}
