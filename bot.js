/**
 * Cita Previa Watcher
 * ---------------------------------------------------
 * Opens the ICP Plus appointment site, navigates to the
 * relevant procedure, and checks whether slots are open.
 * If they are, it sends you a Telegram alert.
 *
 * IMPORTANT: The exact selectors (IDs/classes) on the
 * official site change over time and can differ by step.
 * You MUST inspect the live page yourself (instructions
 * in README.md) and adjust the selectors marked "ADJUST"
 * below before this will work reliably.
 */

const { chromium } = require('playwright');

const TARGET_URL = 'https://icp.administracionelectronica.gob.es/icpplus/index.html';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('No Telegram credentials. Message:', message);
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message }),
    });
    console.log('Telegram notification sent, status:', res.status);
  } catch (err) {
    console.error('Failed to send Telegram notification:', err.message);
  }
}

async function checkAppointments() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    // Go to ICP Plus home page
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // STEP 1: Select Barcelona province
    await page.getByLabel('PROVINCIAS DISPONIBLES').selectOption('/icpplustieb/citar?p=8&locale=es');
    await page.getByRole('button', { name: 'Aceptar' }).click();
    await page.waitForLoadState('domcontentloaded');

    // STEP 2: Select Toma de Huella / TIE procedure
    await page.getByLabel('TRÁMITES POLICÍA NACIONAL').selectOption('4010');
    await page.getByRole('button', { name: 'Aceptar' }).click();
    await page.waitForLoadState('domcontentloaded');

    // STEP 3: Check what the page shows now
    const pageText = await page.innerText('body');

    // These are the Spanish phrases the site shows when fully booked
    const noSlotsPhrases = [
      'En este momento no hay citas disponibles',
      'no hay citas disponibles',
      'no existen citas disponibles',
      'no quedan citas',
    ];

    const isFullyBooked = noSlotsPhrases.some(phrase =>
      pageText.toLowerCase().includes(phrase.toLowerCase())
    );

    // Check for CAPTCHA
    const captchaPresent = await page.locator('iframe[src*="recaptcha"], .g-recaptcha').count();

    if (captchaPresent > 0) {
      console.log('CAPTCHA detected — check the site manually now.');
      await sendTelegram('⚠️ Cita previa bot hit a CAPTCHA. Open the site NOW and check manually: ' + TARGET_URL);
      return;
    }

    if (isFullyBooked) {
      console.log(`[${new Date().toISOString()}] No slots available right now.`);
    } else {
      console.log(`[${new Date().toISOString()}] 🟢 POSSIBLE SLOT OPEN! Go book now!`);
      await sendTelegram('🟢 CITA PREVIA SLOT MAY BE OPEN! Go book NOW: https://icp.administracionelectronica.gob.es/icpplus/index.html');
    }

  } catch (err) {
    console.error('Error during check:', err.message);
  } finally {
    await browser.close();
  }
}

checkAppointments();
