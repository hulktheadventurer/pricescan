import puppeteer from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import puppeteerExtra from 'puppeteer-extra';
import dotenv from 'dotenv';
dotenv.config();

puppeteerExtra.use(StealthPlugin());

export async function scrapeAmazonPrice(url) {
  console.log(`🔍 Checking price for ${url}`);
  let browser;

  try {
    browser = await puppeteerExtra.launch({
      headless: false, // Set to true in production
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    const cookies = [
      { name: 'session-id', value: process.env.AMZ_SESSION_ID, domain: '.amazon.co.uk', path: '/' },
      { name: 'session-token', value: process.env.AMZ_SESSION_TOKEN, domain: '.amazon.co.uk', path: '/' },
      { name: 'ubid-acbuk', value: process.env.AMZ_UBID_ACBUK, domain: '.amazon.co.uk', path: '/' },
      { name: 'x-acbuk', value: process.env.AMZ_X_ACBUK, domain: '.amazon.co.uk', path: '/' },
      { name: 'at-acbuk', value: process.env.AMZ_AT_ACBUK, domain: '.amazon.co.uk', path: '/' }
    ];
    await page.setCookie(...cookies);

    let success = false;
    let attempts = 0;

    while (!success && attempts < 3) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        success = true;
      } catch (err) {
        attempts++;
        console.warn(`⚠️ Retry ${attempts}: ${err.message}`);
        if (attempts >= 3) throw err;
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    console.log('⏳ Waiting 5 seconds...');
    await new Promise(res => setTimeout(res, 5000));

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = `./snapshot-${timestamp}.png`;
    await page.screenshot({ path: screenshotPath });
    console.log('📸 Screenshot saved:', screenshotPath);

    const price = await page.evaluate(() => {
      const selectors = [
        '#priceblock_ourprice',
        '#priceblock_dealprice',
        '#priceblock_saleprice',
        '[data-a-color="price"] .a-offscreen',
        '.a-price .a-offscreen'
      ];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim() && !el.closest('del')) {
          return el.textContent.trim();
        }
      }
      const fallback = Array.from(document.querySelectorAll('.a-price .a-offscreen'))
        .map(el => el.textContent.trim())
        .filter(p => p && !p.includes('£0.00'));
      return fallback[0] || null;
    });

    await browser.close();

    if (!price) {
      console.warn('⚠️ Price not found in DOM');
      return '-';
    }

    console.log(`✅ Price found: ${price}`);
    return price;

  } catch (err) {
    console.error('❌ Puppeteer scrape error:', err.message);
    if (browser) await browser.close();
    return '-';
  }
}
