// server.js
import express from 'express';
import dotenv from 'dotenv';
import { scrapeAmazonPrice } from './scrapeAmazonPrice.js';

dotenv.config();
const app = express();
app.use(express.json());

app.post('/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.includes('amazon')) {
    return res.status(400).json({ message: 'Invalid URL' });
  }

  try {
    const price = await scrapeAmazonPrice(url);
    return res.status(200).json({ price });
  } catch (err) {
    console.error('❌ Scrape error:', err);
    return res.status(500).json({ message: 'Failed to scrape' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Scraper server running on port ${PORT}`));
