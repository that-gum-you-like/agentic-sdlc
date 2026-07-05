#!/usr/bin/env node
/**
 * Telegram Notification Provider — sends messages via the Telegram Bot API.
 *
 * Zero npm dependencies — uses only Node stdlib `https`. Written to mirror the
 * provider pattern in notify.mjs (sendViaOpenclaw / sendViaFile / sendNotification)
 * so it can later be slotted in as a `sendViaTelegram` channel there.
 *
 * Privacy note: opt-in only. No always-on listening, no background polling —
 * this script only sends outbound messages when explicitly invoked, using a
 * bot token the user creates and supplies themselves (via @BotFather).
 *
 * Usage (from other scripts):
 *   import { sendTelegram } from './telegram-notify.mjs';
 *   const result = await sendTelegram('Deploy complete');
 *
 * Usage (CLI):
 *   node agents/telegram-notify.mjs send <message>
 *
 * Config (env vars take priority over project.json):
 *   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID
 *   notification.telegram.{botToken,chatId} in project.json
 */

import https from 'https';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';

/**
 * Resolve bot token + chat id from env first, then config.
 */
function resolveCredentials(opts = {}) {
  const config = opts.config || loadConfig();
  const telegramConfig = config.notification?.telegram || {};

  const botToken = process.env.TELEGRAM_BOT_TOKEN || telegramConfig.botToken || '';
  const chatId = process.env.TELEGRAM_CHAT_ID || telegramConfig.chatId || '';

  return { botToken, chatId };
}

/**
 * POST a JSON body to the Telegram Bot API sendMessage endpoint.
 */
function postToTelegram(botToken, chatId, message) {
  return new Promise((resolvePromise) => {
    const body = JSON.stringify({ chat_id: chatId, text: message });

    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolvePromise({ sent: true });
          } else {
            resolvePromise({ sent: false, reason: `telegram API error ${res.statusCode}: ${data}` });
          }
        });
      }
    );

    req.on('error', (err) => {
      resolvePromise({ sent: false, reason: `telegram request failed: ${err.message}` });
    });

    req.write(body);
    req.end();
  });
}

/**
 * Send a message via the Telegram Bot API.
 *
 * @param {string} message - Text to send
 * @param {object} [opts] - Optional overrides (e.g. { config } for tests)
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
export async function sendTelegram(message, opts = {}) {
  const { botToken, chatId } = resolveCredentials(opts);

  if (!botToken || !chatId) {
    return { sent: false, reason: 'telegram not configured' };
  }

  return postToTelegram(botToken, chatId, message);
}

// ---------------------------------------------------------------------------
// CLI router — only runs when telegram-notify.mjs is invoked directly
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
function __isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === __filename;
}

if (__isMainModule()) {
  const [,, cmd, ...args] = process.argv;

  if (cmd === 'send') {
    const message = args.join(' ');
    if (!message) {
      console.error('Usage: telegram-notify.mjs send <message>');
      process.exit(1);
    }

    logCapabilityUsage('telegramNotify', 'system', 'telegram-notify', 'telegram-notify.mjs', 'send');

    const result = await sendTelegram(message);
    if (result.sent) {
      console.log('📤 Sent via Telegram');
    } else {
      console.error(`❌ Telegram send failed: ${result.reason}`);
      process.exit(1);
    }
  } else {
    console.log(`Telegram Notification Provider

Usage:
  telegram-notify.mjs send <message>   Send a message via Telegram Bot API

Config (env vars take priority over project.json):
  TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID
  notification.telegram.{botToken,chatId} in project.json`);
  }
}
