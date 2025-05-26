// scripts/scheduleDailyCheck.js
import dotenv from 'dotenv';
dotenv.config(); // Loads from .env.local

import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { Resend } from 'resend';
import { runPriceCheck } from '../lib/runPriceCheck.js';

console.log('🕓 Starting daily price check script...');

const resend = new Resend(process.env.RESEND_API_KEY);

// Logging utility
function logToFile(message) {
  const logDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

  const logPath = path.join(logDir, `daily-${new Date().toISOString().slice(0, 10)}.log`);
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
}

// Log rotation: delete logs older than 7 days
function cleanOldLogs() {
  const logDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) return;

  const files = fs.readdirSync(logDir);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const file of files) {
    const filePath = path.join(logDir, file);
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs < cutoff) fs.unlinkSync(filePath);
  }
}

// Retry logic wrapper
async function runPriceCheckWithRetry(retries = 2, delay = 5000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const results = await runPriceCheck();
      return results;
    } catch (err) {
      if (attempt < retries) {
        logToFile(`⚠️ Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }
}

// Wrapper to include logging and retry logic + error email
async function runWithLogging() {
  try {
    const results = await runPriceCheckWithRetry();
    results.forEach(result => {
      logToFile(`${result.status} ${result.url} — ${result.price}`);
    });
    console.log('✅ Manual price check completed.');
  } catch (err) {
    const errorMessage = `❌ Script error: ${err.message}`;
    logToFile(errorMessage);
    console.error(errorMessage);

    // Send email if alert admin is configured
    if (process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_FROM && process.env.ALERT_EMAIL_TO) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);

        await resend.emails.send({
          from: process.env.ALERT_EMAIL_FROM,
          to: process.env.ALERT_EMAIL_TO,
          subject: '🚨 PriceScan Daily Script Error',
          html: `<p>${errorMessage}</p><pre>${err.stack}</pre>`,
        });

        console.log('📧 Error report sent to admin.');
      } catch (emailErr) {
        console.error('⚠️ Failed to send error email:', emailErr.message);
        logToFile(`⚠️ Failed to send error email: ${emailErr.message}`);
      }
    }
  }
}


// Run immediately for testing
runWithLogging();

// Uncomment for daily automation at 9:00 AM
cron.schedule('0 9 * * *', () => {
  console.log('⏰ Running scheduled 9AM price check...');
  runWithLogging();
});

