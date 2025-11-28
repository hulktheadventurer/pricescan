export function normalizeEbayUrl(url: string): string {
  if (!url) return "";

  // Remove tracking junk
  const clean = url.split("?")[0];

  // Extract valid item ID
  const match = clean.match(/\/itm\/(\d{9,12})/);
  if (!match) return ""; // not a real listing

  const itemId = match[1];

  return `https://www.ebay.com/itm/${itemId}`;
}
