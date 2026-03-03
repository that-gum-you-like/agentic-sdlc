#!/usr/bin/env node
/**
 * Mailbox Sync — Captures inbound human messages from OpenClaw session transcripts
 * and writes them to the project's pm/mailbox.md for check-mailbox to parse.
 *
 * Usage:
 *   node agents/mailbox-sync.mjs              # Sync new messages once
 *   node agents/mailbox-sync.mjs --watch      # Watch for new messages continuously
 *   node agents/mailbox-sync.mjs --status     # Show sync state
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = loadConfig();
const NOTIF = config.notification;

// OpenClaw session paths
const OPENCLAW_SESSIONS_DIR = resolve(process.env.HOME, '.openclaw/agents/main/sessions');
const OPENCLAW_SESSIONS_JSON = join(OPENCLAW_SESSIONS_DIR, 'sessions.json');
const CURSOR_PATH = resolve(NOTIF.approvalsDir, '.sync-cursor.json');

function loadCursor() {
  if (!existsSync(CURSOR_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CURSOR_PATH, 'utf8'));
  } catch { return {}; }
}

function saveCursor(cursor) {
  const dir = dirname(CURSOR_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CURSOR_PATH, JSON.stringify(cursor, null, 2));
}

function findActiveSession() {
  if (!existsSync(OPENCLAW_SESSIONS_JSON)) return null;
  try {
    const sessions = JSON.parse(readFileSync(OPENCLAW_SESSIONS_JSON, 'utf8'));
    // Find the main WhatsApp session
    for (const [key, session] of Object.entries(sessions)) {
      if (session.lastChannel === 'whatsapp' && session.sessionFile) {
        return session.sessionFile;
      }
    }
    // Fallback: find the main session
    const mainSession = sessions['agent:main:main'];
    if (mainSession?.sessionFile) return mainSession.sessionFile;
  } catch { /* ignore */ }
  return null;
}

function extractHumanMessages(sessionFile, afterLine) {
  if (!existsSync(sessionFile)) return { messages: [], lastLine: afterLine };

  const content = readFileSync(sessionFile, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  const messages = [];

  for (let i = afterLine; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]);
      const msg = entry.message;
      if (!msg || msg.role !== 'user') continue;

      let text = msg.content || '';
      // Handle array content format: [{"type":"text","text":"..."}]
      if (Array.isArray(text)) {
        text = text.filter(c => c.type === 'text').map(c => c.text).join('\n');
      }
      if (typeof text !== 'string' || !text.trim()) continue;

      // Skip pure system messages (gateway events with no human text)
      const nonSystemLines = text.split('\n').filter(l => !l.startsWith('System:') && !l.startsWith('[system]'));
      const humanText = nonSystemLines.join('\n').trim();
      if (!humanText) continue;
      text = humanText;

      // Extract the actual human message from OpenClaw's metadata wrapper
      // Format: "Conversation info (untrusted metadata):\n```json\n...\n```\n\n[timestamp] actual message"
      // Or just plain text for newer formats
      const metadataMatch = text.match(/```[\s\S]*?```\s*\n\s*(.+)/s);
      if (metadataMatch) {
        text = metadataMatch[1].trim();
      }

      // Skip if it's just metadata with no actual content
      if (text.startsWith('Conversation info') && !text.includes('MST]')) continue;
      if (text.length < 2) continue;

      // Clean up timestamp prefix if present: "[Mon 2026-03-03 14:30 MST] actual message"
      const tsMatch = text.match(/\[.*?\d{4}.*?(?:MST|EST|CST|PST|UTC)\]\s*(.*)/s);
      const cleanText = tsMatch ? tsMatch[1].trim() : text.trim();
      if (!cleanText) continue;

      messages.push({
        timestamp: entry.timestamp || new Date().toISOString(),
        text: cleanText,
        line: i,
      });
    } catch { /* skip malformed lines */ }
  }

  return { messages, lastLine: lines.length };
}

function writeToMailbox(messages) {
  const mailboxPath = NOTIF.mailboxPath;
  const dir = dirname(mailboxPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  if (!existsSync(mailboxPath)) {
    writeFileSync(mailboxPath, '# Human ↔ Agent Mailbox\n\nMessages between the human project owner and the agent network.\n\n---\n');
  }

  for (const msg of messages) {
    const ts = new Date(msg.timestamp).toISOString();
    const entry = `\n**[${ts}] Human →** ${msg.text}\n`;
    appendFileSync(mailboxPath, entry);
  }
}

function sync() {
  const sessionFile = findActiveSession();
  if (!sessionFile) {
    console.log('❌ No active OpenClaw session found.');
    return 0;
  }

  const cursor = loadCursor();
  const afterLine = cursor[sessionFile] || 0;

  const { messages, lastLine } = extractHumanMessages(sessionFile, afterLine);

  if (messages.length > 0) {
    writeToMailbox(messages);
    console.log(`📬 Synced ${messages.length} message(s) from WhatsApp to mailbox:`);
    for (const msg of messages) {
      console.log(`  [${new Date(msg.timestamp).toISOString()}] ${msg.text.substring(0, 100)}`);
    }
  } else {
    console.log('📭 No new human messages.');
  }

  cursor[sessionFile] = lastLine;
  saveCursor(cursor);
  return messages.length;
}

function showStatus() {
  const sessionFile = findActiveSession();
  const cursor = loadCursor();

  console.log('📡 Mailbox Sync Status');
  console.log('─'.repeat(40));
  console.log(`  Session: ${sessionFile || 'not found'}`);
  console.log(`  Mailbox: ${NOTIF.mailboxPath}`);
  console.log(`  Cursor:  ${sessionFile && cursor[sessionFile] ? `line ${cursor[sessionFile]}` : 'not started'}`);

  if (existsSync(NOTIF.mailboxPath)) {
    const content = readFileSync(NOTIF.mailboxPath, 'utf8');
    const humanMsgs = (content.match(/Human →/g) || []).length;
    const agentMsgs = (content.match(/Agent →/g) || []).length;
    console.log(`  Messages: ${humanMsgs} human, ${agentMsgs} agent`);
  }
}

// CLI
const [,, cmd] = process.argv;

switch (cmd) {
  case '--watch': {
    console.log('👀 Watching for new messages (Ctrl+C to stop)...\n');
    sync();
    setInterval(() => {
      const count = sync();
      if (count > 0) console.log('');
    }, 10000); // Check every 10 seconds
    break;
  }
  case '--status':
    showStatus();
    break;
  default:
    sync();
}
