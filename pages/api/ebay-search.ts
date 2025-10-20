import type { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const keyword = (req.query.q as string) || 'sample'
  const appId = process.env.EBAY_APP_ID
  const campid = process.env.EBAY_PARTNER_ID

  // --- mock fallback ---
  const mockEbay = {
    ItemsResult: {
      Items: [
        {
          ItemInfo: { Title: { DisplayValue: `${keyword} – Wireless Headphones (eBay)` } },
          Offers: { Listings: [{ Price: { DisplayAmount: "£37.49" } }] },
          Images: { Primary: { Large: { URL: "https://via.placeholder.com/150/f60/fff?text=eBay+1" } } },
          DetailPageURL: "https://www.ebay.co.uk/itm/example1"
        },
        {
          ItemInfo: { Title: { DisplayValue: `${keyword} – Noise Cancelling Headphones (eBay)` } },
          Offers: { Listings: [{ Price: { DisplayAmount: "£54.99" } }] },
          Images: { Primary: { Large: { URL: "https://via.placeholder.com/150/d50/fff?text=eBay+2" } } },
          DetailPageURL: "https://www.ebay.co.uk/itm/example2"
        }
      ]
    }
  }

  // If no key yet, serve mock data
  if (!appId) return res.status(200).json(mockEbay)

  try {
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(keyword)}&limit=5`
    const headers = { 'Authorization': `Bearer ${appId}`, 'Content-Type': 'application/json' }

    const { data } = await axios.get(url, { headers })

    const items = data.itemSummaries?.map((item: any) => ({
      ItemInfo: { Title: { DisplayValue: item.title } },
      Offers: { Listings: [{ Price: { DisplayAmount: `£${item.price?.value}` } }] },
      Images: { Primary: { Large: { URL: item.image?.imageUrl } } },
      DetailPageURL: `${item.itemWebUrl}?campid=${campid}`
    })) || []

    res.status(200).json({ ItemsResult: { Items: items } })
  } catch (err: any) {
    console.error('eBay API failed, using mock data', err.message)
    res.status(200).json(mockEbay)
  }
}
