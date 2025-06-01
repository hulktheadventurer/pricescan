import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
dotenv.config();

puppeteer.use(StealthPlugin());

async function scrapeAmazonPrice(url) {
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: false, // for debugging, set to true for production
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  console.log('🍪 Setting cookies...');
  const cookies = [
    { name: 'session-id', value: process.env.AMZ_SESSION_ID, domain: '.amazon.co.uk' },
    { name: 'session-token', value: process.env.AMZ_SESSION_TOKEN, domain: '.amazon.co.uk' },
    { name: 'ubid-acbuk', value: process.env.AMZ_UBID_ACBUK, domain: '.amazon.co.uk' },
    { name: 'x-acbuk', value: process.env.AMZ_X_ACBUK, domain: '.amazon.co.uk' },
    { name: 'at-acbuk', value: process.env.AMZ_AT_ACBUK, domain: '.amazon.co.uk' },
  ];
  await page.setCookie(...cookies);

  console.log(`🌐 Navigating to: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('🔍 Looking for price...');
  const price = await page.evaluate(() => {
    const symbol = document.querySelector('.a-price-symbol');
    const whole = document.querySelector('.a-price-whole');
    const fraction = document.querySelector('.a-price-fraction');

  if (symbol && whole && fraction) {
  const rawWhole = whole.textContent.replace(/[^\d]/g, ''); // removes non-numeric characters
  const rawFraction = fraction.textContent.replace(/[^\d]/g, '');
  return `${symbol.textContent.trim()}${rawWhole}.${rawFraction}`;
}


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

    return null;
  });

  if (price) {
    console.log(`✅ Price found: ${price}`);
  } else {
    console.log('❌ Price not found.');
  }

  await browser.close();
}

const url = process.argv[2];
if (!url) {
  console.error('❌ Please provide an Amazon URL');
  process.exit(1);
}

scrapeAmazonPrice(url);
