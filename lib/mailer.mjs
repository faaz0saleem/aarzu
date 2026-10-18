// Outgoing notifications without dependencies:
//  - email over SMTP with implicit TLS (port 465, e.g. Gmail with an app password)
//  - Telegram bot messages (instant phone alerts for the owner)
// Configured from environment variables; anything not configured is skipped.
import tls from "node:tls";
import os from "node:os";

const env = (k) => process.env[k] || "";
export const mailEnabled = () => !!(env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS"));
export const telegramEnabled = () => !!(env("TELEGRAM_BOT_TOKEN") && env("TELEGRAM_CHAT_ID"));

const b64 = (s) => Buffer.from(String(s), "utf8").toString("base64");
const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const wrap76 = (s) => s.replace(/.{1,76}/g, "$&\r\n");

// Minimal SMTP conversation: EHLO, AUTH LOGIN, MAIL FROM, RCPT TO, DATA, QUIT.
export function sendMail({ to, subject, html, text }) {
  if (!mailEnabled()) return Promise.resolve({ skipped: true });
  const host = env("SMTP_HOST");
  const port = Number(env("SMTP_PORT")) || 465;
  const user = env("SMTP_USER");
  const from = env("MAIL_FROM") || user;
  const fromAddr = (from.match(/<([^>]+)>/) || [, from])[1];
  const recipients = [].concat(to).filter(Boolean);
  if (!recipients.length) return Promise.resolve({ skipped: true });

  const boundary = "aarzu" + Date.now().toString(36);
  const message = [
    `From: ${from.includes("<") ? from.replace(/^(.*?)\s*</, (m, n) => `${encodeHeader(n.trim())} <`) : from}`,
    `To: ${recipients.join(", ")}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${fromAddr.split("@")[1] || "aarzu"}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64(text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())),
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64(html)),
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: env("SMTP_INSECURE") !== "1" });
    socket.setTimeout(20000, () => socket.destroy(new Error("SMTP timeout")));
    let buffer = "";
    let waiting = null;
    socket.on("data", (d) => {
      buffer += d.toString("utf8");
      // a reply is complete when its last line is "NNN text" (not "NNN-text")
      const lines = buffer.split("\r\n");
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i])) {
          const reply = lines.slice(0, i + 1).join("\n");
          buffer = lines.slice(i + 1).join("\r\n");
          const w = waiting;
          waiting = null;
          w?.(reply);
          return;
        }
      }
    });
    socket.on("error", reject);
    const expect = (code) => new Promise((ok, bad) => {
      waiting = (reply) => (reply.slice(0, 3) === String(code) ? ok(reply) : bad(new Error(`SMTP expected ${code}, got: ${reply.split("\n").pop()}`)));
    });
    const cmd = (line, code) => { const p = expect(code); socket.write(line + "\r\n"); return p; };
    (async () => {
      await expect(220);
      await cmd(`EHLO ${os.hostname() || "aarzu"}`, 250);
      await cmd("AUTH LOGIN", 334);
      await cmd(b64(user), 334);
      await cmd(b64(env("SMTP_PASS")), 235);
      await cmd(`MAIL FROM:<${fromAddr}>`, 250);
      for (const r of recipients) await cmd(`RCPT TO:<${r}>`, 250);
      await cmd("DATA", 354);
      await cmd(message + "\r\n.", 250);
      socket.write("QUIT\r\n");
      socket.end();
      resolve({ sent: recipients.length });
    })().catch((e) => { socket.destroy(); reject(e); });
  });
}

export async function sendTelegram(text) {
  if (!telegramEnabled()) return { skipped: true };
  const r = await fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env("TELEGRAM_CHAT_ID"), text, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Telegram HTTP ${r.status}`);
  return { sent: 1 };
}
