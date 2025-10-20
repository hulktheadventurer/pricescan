import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const keyword = (req.query.q as string) || 'sample'

  const mockAmazon = {
    ItemsResult: {
      Items: [
        {
          ItemInfo: { Title: { DisplayValue: `${keyword} – Wireless Headphones` } },
          Offers: { Listings: [{ Price: { DisplayAmount: "£39.99" } }] },
          Images: { Primary: { Large: { URL: "https://via.placeholder.com/150/007bff/ffffff?text=Amazon+1" } } },
          DetailPageURL: "https://www.amazon.co.uk/dp/example1?tag=theforbiddenshield-21"
        },
        {
          ItemInfo: { Title: { DisplayValue: `${keyword} – Noise Cancelling Headphones` } },
          Offers: { Listings: [{ Price: { DisplayAmount: "£59.99" } }] },
          Images: { Primary: { Large: { URL: "https://via.placeholder.com/150/0055aa/ffffff?text=Amazon+2" } } },
          DetailPageURL: "https://www.amazon.co.uk/dp/example2?tag=theforbiddenshield-21"
        }
      ]
    }
  }

  res.status(200).json(mockAmazon)
}
