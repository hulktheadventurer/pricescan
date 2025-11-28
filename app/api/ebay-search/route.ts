import { NextResponse } from "next/server";
import EbayAdapter from "@/lib/adapters/ebay/resolve";

const laptopCategory = "175672";

// 🔎 Filter out accessories
function isAccessory(title: string): boolean {
  const banned = [
    "adapter", "charger", "power jack", "socket", "cable", "battery",
    "bios", "rtc", "cmos", "keyboard", "screen", "hinge", "housing",
    "cover", "shell", "frame", "fan", "speaker", "palmrest",
  ];
  const lower = title.toLowerCase();
  return banned.some((w) => lower.includes(w));
}

// 🔎 Filter out broken / missing parts
function isBrokenOrIncomplete(item: {
  title: string;
  condition?: string;
}): boolean {
  const text = `${item.title} ${item.condition || ""}`.toLowerCase();
  const bad = [
    "for parts",
    "as is",
    "no hdd",
    "no ssd",
    "no ram",
    "no memory",
    "no os",
    "no operating system",
    "untested",
    "not working",
    "faulty",
    "broken",
    "spares",
    "repair",
  ];
  return bad.some((w) => text.includes(w));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");
    const limit = Number(searchParams.get("limit") || 20);

    if (!q) {
      return NextResponse.json(
        { error: "Missing query" },
        { status: 400 }
      );
    }

    const adapter = new EbayAdapter();

    // 🔥 Run a keyword search using the new adapter
    const offer = await adapter.resolve(q);

    // If adapter returns *one* offer → wrap it like normal search results
    const resultItem = {
      id: q,
      title: offer.title,
      url: "",
      price: offer.price,
      currency: offer.currency,
      condition: "",
      image: "",
    };

    // Filtering logic still applies
    const cleaned =
      !isAccessory(resultItem.title) &&
      !isBrokenOrIncomplete(resultItem)
        ? [resultItem]
        : [];

    return NextResponse.json({
      query: q,
      results: cleaned,
    });
  } catch (err: any) {
    console.error("💥 eBay search error:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
