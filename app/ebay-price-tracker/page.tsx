import Link from "next/link";

export const metadata = {
  title: "eBay Price Tracker & Price History | PriceScan",
  description:
    "Track real eBay price history and get alerts only for meaningful price drops. PriceScan helps you think before you buy.",
};

export default function EbayPriceTrackerPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* HERO */}
      <h1 className="text-3xl md:text-4xl font-bold mb-4">
        eBay Price Tracker that shows real price history
      </h1>

      <p className="text-gray-600 text-lg mb-8">
        PriceScan helps you see whether an eBay “deal” is actually cheap — or
        just looks cheap today.
      </p>

      <Link
        href="/"
        className="inline-block bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700"
      >
        Track an eBay item
      </Link>

      {/* WHY */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold mb-4">
          Why use PriceScan instead of eBay alerts?
        </h2>

        <ul className="space-y-4 text-gray-700">
          <li>
            <b>Price history, not just alerts.</b>
            <br />
            eBay alerts tell you when a price changes. PriceScan shows you what
            the price has been over time, so you can judge the deal properly.
          </li>

          <li>
            <b>No alert spam.</b>
            <br />
            PriceScan only alerts you when there is a meaningful price drop —
            not tiny changes or currency-related noise.
          </li>

          <li>
            <b>Designed to slow impulse buying.</b>
            <br />
            Instead of pushing urgency, PriceScan encourages you to observe
            prices calmly before deciding.
          </li>
        </ul>
      </section>

      {/* HOW IT WORKS */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold mb-4">How it works</h2>

        <ol className="list-decimal list-inside space-y-3 text-gray-700">
          <li>Paste an eBay product link into PriceScan</li>
          <li>PriceScan records price snapshots over time</li>
          <li>You can view price history and trends</li>
          <li>You receive alerts only for meaningful drops or restocks</li>
        </ol>
      </section>

      {/* WHO IT IS FOR */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold mb-4">Who this is for</h2>

        <p className="text-gray-700">
          PriceScan is for people who don’t want to rush into purchases. If you
          prefer to wait, observe, and buy with confidence instead of reacting
          to marketing pressure, this tool is built for you.
        </p>
      </section>

      {/* CTA */}
      <section className="mt-12 text-center">
        <Link
          href="/"
          className="inline-block bg-blue-600 text-white px-8 py-4 rounded-md font-medium hover:bg-blue-700"
        >
          Start tracking an eBay price
        </Link>
      </section>
    </div>
  );
}
