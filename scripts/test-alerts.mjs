// Sends a test email and Telegram message using the settings in .env.
//   npm run test-alerts
import "../lib/env.mjs";
import { sendMail, sendTelegram, mailEnabled, telegramEnabled } from "../lib/mailer.mjs";

if (!mailEnabled() && !telegramEnabled()) {
  console.log("No alerts configured. Fill SMTP_* and/or TELEGRAM_* in .env first (see .env.example).");
  process.exit(1);
}
if (mailEnabled()) {
  try {
    const to = (process.env.ORDER_ALERT_EMAIL || process.env.SMTP_USER).split(",");
    await sendMail({ to, subject: "Aarzu test alert ✓", html: "<p>Your Aarzu order alerts are working. 🎉</p>" });
    console.log(`✓ Test email sent to ${to.join(", ")}`);
  } catch (e) {
    console.log(`✗ Email failed: ${e.message}`);
  }
}
if (telegramEnabled()) {
  try {
    await sendTelegram("✅ Aarzu test alert: your Telegram order alerts are working.");
    console.log("✓ Test Telegram message sent");
  } catch (e) {
    console.log(`✗ Telegram failed: ${e.message}`);
  }
}
