// lib/scrapePrice.js
import puppeteer from 'puppeteer';

export async function scrapeAmazonPrice(url) {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36'
    );

    // Go to product page
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000, // generous timeout to handle slow pages
    });

    // Small wait for dynamic content to finish rendering
    await new Promise((res) => setTimeout(res, 3000));

    const price = await page.evaluate(() => {
      const selectors = [
        '#priceblock_ourprice',
        '#priceblock_dealprice',
        '#priceblock_saleprice',
        '.a-price .a-offscreen',
        '[data-asin-price]',
        '.apexPriceToPay .a-offscreen',
        '.a-color-price',
        '.a-price-whole',
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.innerText) {
          return el.innerText.trim();
        }
      }

      return null;
    });

    return price || 'Not found';
  } catch (err) {
    console.error('❌ Puppeteer scrape error:', err.message);
    return 'Not found';
  } finally {
    if (browser) await browser.close();
  }
}
