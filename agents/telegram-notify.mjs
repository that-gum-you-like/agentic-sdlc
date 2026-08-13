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
import { createReadStream, statSync } from 'fs';
import { basename, resolve } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';

/**
 * Strip a bot token from any string before it reaches a log or an error.
 * Telegram embeds the token in the URL path, so error bodies can echo it back.
 */
/**
 * Connection-level failures worth retrying. Observed live: api.telegram.org
 * intermittently times out on the first connection attempt from this host,
 * succeeding immediately on a retry.
 */
export const TRANSIENT_CODES = new Set([
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH', 'EPIPE', 'ESOCKETTIMEDOUT',
]);

export function redactToken(text, botToken) {
  if (!text) return text;
  let out = String(text);
  if (botToken) out = out.split(botToken).join('<redacted>');
  return out.replace(/bot\d{6,}:[A-Za-z0-9_-]{20,}/g, 'bot<redacted>');
}

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
// File upload (sendDocument) — added for screenrec
//
// sendDocument needs multipart/form-data, which the JSON-only postToTelegram()
// above cannot express. Encoded by hand over stdlib https to preserve the
// zero-npm-dependency rule. The file is STREAMED, not buffered, so a 50 MB part
// never sits in memory.
// ---------------------------------------------------------------------------

/**
 * Build the multipart preamble/epilogue around a streamed file body.
 * Exported for tests — asserting body shape shouldn't require a network call.
 */
export function buildMultipart(boundary, fields, fileField, filename) {
  const head = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
    )
    .join('');

  const fileHeader =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`;

  const tail = `\r\n--${boundary}--\r\n`;

  return { head: head + fileHeader, tail };
}

function uploadOnce(botToken, chatId, filePath, caption) {
  return new Promise((resolvePromise) => {
    const boundary = `----screenrec${Date.now().toString(16)}`;
    const filename = basename(filePath);
    const { head, tail } = buildMultipart(
      boundary,
      { chat_id: chatId, caption },
      'document',
      filename
    );

    const fileSize = statSync(filePath).size;
    const contentLength =
      Buffer.byteLength(head) + fileSize + Buffer.byteLength(tail);

    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${botToken}/sendDocument`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': contentLength,
        },
        timeout: 300000, // 5 min — a 50 MB upload on a slow link is legitimate
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolvePromise({ sent: true });
          } else if (res.statusCode === 429) {
            let retryAfter = 5;
            try { retryAfter = JSON.parse(data).parameters?.retry_after ?? 5; } catch { /* default */ }
            resolvePromise({ sent: false, rateLimited: true, retryAfter });
          } else {
            resolvePromise({
              sent: false,
              reason: redactToken(`telegram API error ${res.statusCode}: ${data}`, botToken),
            });
          }
        });
      }
    );

    req.on('error', (err) => {
      const detail = redactToken(err.message, botToken) || err.code || 'network error';
      resolvePromise({
        sent: false,
        // Transient connection failures are common on this host and are worth
        // another attempt; a 400 from the API is not.
        transient: TRANSIENT_CODES.has(err.code),
        reason: `telegram upload failed: ${detail}`,
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolvePromise({ sent: false, reason: 'telegram upload timed out' });
    });

    req.write(head);
    const stream = createReadStream(filePath);
    stream.on('error', (err) => {
      req.destroy();
      resolvePromise({ sent: false, reason: `could not read ${filePath}: ${err.message}` });
    });
    stream.on('end', () => { req.end(tail); });
    stream.pipe(req, { end: false });
  });
}

/**
 * Upload a file to the configured chat, retrying on 429 up to `maxAttempts`.
 *
 * @param {string} filePath
 * @param {object} [opts] - { caption, maxAttempts, sleep, config }
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
export async function sendDocumentTelegram(filePath, opts = {}) {
  const { botToken, chatId } = resolveCredentials(opts);
  if (!botToken || !chatId) return { sent: false, reason: 'telegram not configured' };

  const maxAttempts = opts.maxAttempts ?? 3;
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const upload = opts.upload || uploadOnce;

  let last = { sent: false, reason: 'upload not attempted' };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await upload(botToken, chatId, filePath, opts.caption);
    if (last.sent) return { sent: true };

    if (last.rateLimited && attempt < maxAttempts) {
      await sleep(last.retryAfter * 1000);
      continue;
    }
    if (last.rateLimited) {
      return { sent: false, reason: `rate limited after ${maxAttempts} attempts` };
    }

    if (last.transient && attempt < maxAttempts) {
      await sleep(1000 * attempt); // linear backoff: 1s, 2s
      continue;
    }

    return last;
  }

  return last;
}

/**
 * Resolve the destination chat so callers can show WHO a file is going to
 * before uploading it. Sends nothing.
 */
export async function getChatTelegram(opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 3;
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));

  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await getChatOnce(opts);
    if (last.ok || !last.transient || attempt === maxAttempts) return last;
    await sleep(1000 * attempt);
  }
  return last;
}

function getChatOnce(opts = {}) {
  const { botToken, chatId } = resolveCredentials(opts);
  if (!botToken || !chatId) {
    return Promise.resolve({ ok: false, reason: 'telegram not configured' });
  }

  return new Promise((resolvePromise) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${botToken}/getChat?chat_id=${encodeURIComponent(chatId)}`,
        method: 'GET',
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.ok) {
              const r = parsed.result;
              const name = [r.first_name, r.last_name].filter(Boolean).join(' ')
                || r.title || r.username || String(chatId);
              resolvePromise({ ok: true, name, type: r.type });
            } else {
              resolvePromise({ ok: false, reason: redactToken(parsed.description || data, botToken) });
            }
          } catch {
            resolvePromise({ ok: false, reason: 'could not parse getChat response' });
          }
        });
      }
    );
    req.on('error', (err) => {
      // Network errors sometimes carry an empty message (DNS blips do this),
      // and "failed: " with nothing after it tells the user nothing.
      const detail = redactToken(err.message, botToken) || err.code || 'network error';
      resolvePromise({
        ok: false,
        transient: TRANSIENT_CODES.has(err.code),
        reason: `getChat request failed: ${detail}`,
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolvePromise({ ok: false, transient: true, reason: 'getChat timed out' });
    });
    req.end();
  });
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
