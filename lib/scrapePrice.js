import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

export async function scrapeAmazonPrice(url) {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36'
    );

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await delay(4000);

    // DEBUG: Dump full HTML to terminal
    const content = await page.content();
    console.log('🔎 HTML snapshot:\n', content.slice(0, 3000)); // Preview only first part

    return 'Not found'; // Skip selector for now
  } catch (err) {
    console.error('❌ Puppeteer scrape error:', err.message);
    return 'Not found';
  } finally {
    if (browser) await browser.close();
  }
}
