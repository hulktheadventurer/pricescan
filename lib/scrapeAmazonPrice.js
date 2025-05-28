// lib/scrapeAmazonPrice.js
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
dotenv.config();

puppeteer.use(StealthPlugin());

export async function scrapeAmazonPrice(url) {
  console.log(`🔍 Checking price for ${url}`);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/opt/render/.cache/puppeteer/chrome/linux-136.0.7108.94/chrome-linux64/chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  });
  const page = await browser.newPage();

  const cookies = [
    { name: 'session-id', value: process.env.AMZ_SESSION_ID, domain: '.amazon.co.uk', path: '/' },
    { name: 'session-token', value: process.env.AMZ_SESSION_TOKEN, domain: '.amazon.co.uk', path: '/' },
    { name: 'ubid-acbuk', value: process.env.AMZ_UBID_ACBUK, domain: '.amazon.co.uk', path: '/' },
    { name: 'x-acbuk', value: process.env.AMZ_X_ACBUK, domain: '.amazon.co.uk', path: '/' },
    { name: 'at-acbuk', value: process.env.AMZ_AT_ACBUK, domain: '.amazon.co.uk', path: '/' }
  ].filter(cookie => cookie.value); // only keep cookies with defined values

  try {
    if (cookies.length > 0) {
      await page.setCookie(...cookies);
    } else {
      console.warn('⚠️ No valid Amazon session cookies provided. Proceeding without login.');
    }

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(res => setTimeout(res, 2000));

    const price = await page.evaluate(() => {
      const selectors = [
        '#priceblock_dealprice',
        '#priceblock_ourprice',
        '#priceblock_saleprice',
        '[data-asin-price]',
        '.a-price .a-offscreen',
        '.a-price-whole'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent) return el.textContent.trim();
      }
      return null;
    });

    if (!price) {
      console.warn('⚠️ No price found. Amazon layout may have changed.');
    }

    await browser.close();
    return price || '-';
  } catch (err) {
    console.error('❌ Puppeteer scrape error:', err.message);
    await browser.close();
    return '-';
  }
}
