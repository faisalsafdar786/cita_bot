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

// ---- Configuration (set these via environment variables) ----
const TARGET_URL = process.env.TARGET_URL ||
  'https://icp.administracionelectronica.gob.es/icpplus/index.html';
const PROVINCE = process.env.PROVINCE || 'Barcelona';
const PROCEDURE_TEXT = process.env.PROCEDURE || 'POLICIA-TOMA DE HUELLA';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// How many times to retry a step if the page is slow/blocked
const MAX_RETRIES = 2;

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('No Telegram credentials set, skipping notification. Message was:', message);
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message }),
    });
    console.log('Notification request sent, status:', res.status);
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
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // STEP 1: Select province
    // ADJUST: open devtools on the real page, find the actual <select> id
    await page.selectOption('select#form', { label: PROVINCE });
    await page.click('input[name="btnAceptar"]'); // ADJUST selector

    await page.waitForLoadState('domcontentloaded');

    // STEP 2: Select the procedure/tramite
    // ADJUST: this dropdown id/label text will vary
    await page.selectOption('select#tramiteGrupo[name="tramiteGrupo"]', { label: PROCEDURE_TEXT });
    await page.click('input[name="btnEnviar"]'); // ADJUST selector

    await page.waitForLoadState('domcontentloaded');

    // STEP 3: Detect whether the "no appointments" message is shown
    // ADJUST: copy the EXACT text shown on the page when slots are full
    const noSlotsLocator = page.getByText('No hay citas disponibles', { exact: false });
    const noSlots = await noSlotsLocator.count();

    // Also watch out for a CAPTCHA blocking further automated progress
    const captchaPresent = await page.locator('iframe[src*="recaptcha"], .g-recaptcha').count();

    if (captchaPresent > 0) {
      console.log('A CAPTCHA appeared, cannot verify slots automatically beyond this point.');
      await sendTelegram('Cita previa bot reached a CAPTCHA step. Check the site manually now: ' + TARGET_URL);
      return;
    }

    if (noSlots === 0) {
      console.log('No "fully booked" message detected, slots may be available!');
      await sendTelegram('Possible cita previa slot open! Go book now: ' + TARGET_URL);
    } else {
      console.log(`[${new Date().toISOString()}] No slots available right now.`);
    }
  } catch (err) {
    console.error('Error during check:', err.message);
  } finally {
    await browser.close();
  }
}

checkAppointments();
