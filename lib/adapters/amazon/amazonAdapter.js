// ======================================================
// PriceScan Stage 12 – Amazon Adapter (ESM Ready)
// ======================================================
import crypto from "crypto";
function isoTimestamp() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
export class AmazonAdapter {
    constructor() {
        this.accessKey = process.env.AMAZON_ACCESS_KEY || "";
        this.secretKey = process.env.AMAZON_SECRET_KEY || "";
        this.associateTag = process.env.AMAZON_ASSOC_TAG || "";
        this.region = process.env.AMAZON_REGION || "eu-west-1";
        this.endpoint = "webservices.amazon.co.uk";
    }
    limits() {
        return { rpm: 60, burst: 10 };
    }
    async resolve(query) {
        if (!this.accessKey || !this.secretKey || !this.associateTag) {
            console.warn("Amazon API credentials not configured — using stub data");
            const title = query.keyword || query.url || "Unknown Product";
            return [
                {
                    sku: "STUB-ASIN-001",
                    title: `[Stub] ${title}`,
                    url: query.url || "https://www.amazon.co.uk",
                    price: Math.round(Math.random() * 100) + 10,
                    currency: "GBP",
                    seller: "Amazon (stub)",
                    image: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
                },
            ];
        }
        let asin = query.sku;
        if (!asin && query.url) {
            const match = query.url.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
            asin = match ? match[1] : undefined;
        }
        if (!asin && !query.keyword)
            throw new Error("Missing ASIN or keyword for AmazonAdapter.resolve()");
        const body = {
            PartnerTag: this.associateTag,
            PartnerType: "Associates",
            Marketplace: "www.amazon.co.uk",
            Resources: [
                "Images.Primary.Medium",
                "ItemInfo.Title",
                "Offers.Listings.Price",
                "Offers.Listings.MerchantInfo",
            ],
            ...(asin
                ? { ItemIds: [asin], Operation: "GetItems" }
                : { Keywords: query.keyword, Operation: "SearchItems" }),
        };
        const host = this.endpoint;
        const path = "/paapi5/" + (asin ? "getitems" : "searchitems");
        const amzDate = isoTimestamp();
        const payload = JSON.stringify(body);
        const service = "ProductAdvertisingAPI";
        const method = "POST";
        const headers = {
            host,
            "content-type": "application/json; charset=UTF-8",
            "x-amz-date": amzDate,
            "x-amz-target": `com.amazon.paapi5.v1.${asin ? "GetItems" : "SearchItems"}`,
        };
        const canonicalHeaders = Object.entries(headers)
            .map(([k, v]) => `${k}:${v}\n`)
            .join("") + "\n";
        const signedHeaders = Object.keys(headers).join(";");
        const hash = crypto.createHash("sha256").update(payload).digest("hex");
        const canonicalRequest = [
            method,
            path,
            "",
            canonicalHeaders,
            signedHeaders,
            hash,
        ].join("\n");
        const credentialScope = `${amzDate.slice(0, 8)}/${this.region}/paapi5/aws4_request`;
        const stringToSign = [
            "AWS4-HMAC-SHA256",
            amzDate,
            credentialScope,
            crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
        ].join("\n");
        const kDate = crypto
            .createHmac("sha256", "AWS4" + this.secretKey)
            .update(amzDate.slice(0, 8))
            .digest();
        const kRegion = crypto.createHmac("sha256", kDate).update(this.region).digest();
        const kService = crypto.createHmac("sha256", kRegion).update("paapi5").digest();
        const kSigning = crypto
            .createHmac("sha256", kService)
            .update("aws4_request")
            .digest();
        const signature = crypto
            .createHmac("sha256", kSigning)
            .update(stringToSign)
            .digest("hex");
        const authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, ` +
            `SignedHeaders=${signedHeaders}, Signature=${signature}`;
        const response = await fetch(`https://${host}${path}`, {
            method,
            headers: { ...headers, Authorization: authorization },
            body: payload,
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Amazon API error ${response.status}: ${text}`);
        }
        const data = await response.json();
        const items = data.ItemsResult?.Items || data.SearchResult?.Items || [];
        return items.map((item) => ({
            sku: item.ASIN,
            title: item.ItemInfo?.Title?.DisplayValue || "Unknown Item",
            url: item.DetailPageURL ||
                `https://www.amazon.co.uk/dp/${item.ASIN}?tag=${this.associateTag}`,
            price: parseFloat(item.Offers?.Listings?.[0]?.Price?.Amount || "0") || 0,
            currency: item.Offers?.Listings?.[0]?.Price?.Currency || "GBP",
            seller: item.Offers?.Listings?.[0]?.MerchantInfo?.Name || "Amazon",
            image: item.Images?.Primary?.Medium?.URL,
        }));
    }
    async affiliateLink(url) {
        if (!url)
            return url;
        if (!this.associateTag)
            return url;
        const u = new URL(url);
        u.searchParams.set("tag", this.associateTag);
        return u.toString();
    }
}
export default AmazonAdapter;
