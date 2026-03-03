#!/usr/bin/env node
/**
 * Notification & Approval Layer — Human-in-the-loop communication for the agent network.
 *
 * Usage:
 *   node agents/notify.mjs send <message> [--media <path>]
 *   node agents/notify.mjs approve <message> --task <id> [--timeout <seconds>] [--media <path>]
 *   node agents/notify.mjs check-mailbox
 *   node agents/notify.mjs pending
 *   node agents/notify.mjs resolve <approval-id> approved|rejected [--note <text>]
 *   node agents/notify.mjs status
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, appendFileSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';

import { loadConfig } from './load-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = loadConfig();
const NOTIF = config.notification;

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

function sendViaOpenclaw(message, mediaPath) {
  const channel = NOTIF.channel;
  if (!channel) {
    console.error('❌ OpenClaw provider requires notification.channel in project.json');
    process.exit(1);
  }

  let cmd = `openclaw message send --channel whatsapp --target "${channel}" --message "${message.replace(/"/g, '\\"')}"`;
  if (mediaPath) {
    const absMedia = resolve(mediaPath);
    cmd += ` --media "${absMedia}"`;
  }

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 30000 });
    console.log(`📤 Sent via OpenClaw to ${channel}`);
    return true;
  } catch (err) {
    console.error(`❌ OpenClaw send failed: ${err.message}`);
    return false;
  }
}

function sendViaFile(message, mediaPath) {
  const mailboxPath = NOTIF.mailboxPath;
  const dir = dirname(mailboxPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString();
  const mediaNote = mediaPath ? ` [media: ${mediaPath}]` : '';
  const entry = `\n**[${timestamp}] Agent →** ${message}${mediaNote}\n`;

  appendFileSync(mailboxPath, entry);
  console.log(`📝 Appended to ${mailboxPath}`);
  return true;
}

function sendViaNone(message) {
  console.log(`📋 [no provider] ${message}`);
  return true;
}

function sendNotification(message, mediaPath) {
  switch (NOTIF.provider) {
    case 'openclaw':
      return sendViaOpenclaw(message, mediaPath);
    case 'file':
      return sendViaFile(message, mediaPath);
    case 'none':
    default:
      return sendViaNone(message);
  }
}

// ---------------------------------------------------------------------------
// Approval file management
// ---------------------------------------------------------------------------

function ensureApprovalsDir() {
  if (!existsSync(NOTIF.approvalsDir)) {
    mkdirSync(NOTIF.approvalsDir, { recursive: true });
  }
}

function generateApprovalId() {
  return `approval-${Date.now()}-${randomBytes(3).toString('hex')}`;
}

function loadApproval(id) {
  const filePath = resolve(NOTIF.approvalsDir, `${id}.json`);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function saveApproval(approval) {
  ensureApprovalsDir();
  const filePath = resolve(NOTIF.approvalsDir, `${approval.id}.json`);
  writeFileSync(filePath, JSON.stringify(approval, null, 2));
}

function listApprovals(statusFilter) {
  ensureApprovalsDir();
  const files = readdirSync(NOTIF.approvalsDir).filter(f => f.endsWith('.json') && !f.startsWith('.'));
  const approvals = [];
  for (const file of files) {
    try {
      const approval = JSON.parse(readFileSync(resolve(NOTIF.approvalsDir, file), 'utf8'));
      if (!statusFilter || approval.status === statusFilter) {
        approvals.push(approval);
      }
    } catch { /* skip malformed files */ }
  }
  return approvals.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
}

// ---------------------------------------------------------------------------
// Mailbox parsing
// ---------------------------------------------------------------------------

function loadMailboxCursor() {
  const cursorPath = resolve(NOTIF.approvalsDir, '.mailbox-cursor.json');
  if (!existsSync(cursorPath)) return { lastChecked: null, lastByte: 0 };
  try {
    return JSON.parse(readFileSync(cursorPath, 'utf8'));
  } catch {
    return { lastChecked: null, lastByte: 0 };
  }
}

function saveMailboxCursor(cursor) {
  ensureApprovalsDir();
  const cursorPath = resolve(NOTIF.approvalsDir, '.mailbox-cursor.json');
  writeFileSync(cursorPath, JSON.stringify(cursor, null, 2));
}

function parseMailboxMessages(content, afterByte) {
  const relevant = content.slice(afterByte);
  // Match lines that look like human messages (not agent messages)
  // Agent messages: **[timestamp] Agent →**
  // Human messages: anything else with a timestamp pattern or plain text lines
  const messages = [];
  const lines = relevant.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('# ') || trimmed.startsWith('**[') && trimmed.includes('Agent →')) {
      continue; // Skip headers, empty lines, and agent-sent messages
    }
    // Look for human messages: **[timestamp] Human →** or plain text responses
    if (trimmed.startsWith('**[') && trimmed.includes('Human →')) {
      const match = trimmed.match(/\*\*\[(.+?)\] Human →\*\*\s*(.*)/);
      if (match) {
        messages.push({ timestamp: match[1], text: match[2].trim() });
      }
    } else if (trimmed.length > 1 && !trimmed.startsWith('---')) {
      // Plain text that isn't a separator — treat as human input
      messages.push({ timestamp: new Date().toISOString(), text: trimmed });
    }
  }

  return messages;
}

const APPROVE_KEYWORDS = ['approved', 'approve', 'yes', 'lgtm', 'looks good', 'go ahead', 'ship it', '👍'];
const REJECT_KEYWORDS = ['rejected', 'reject', 'no', 'deny', 'denied', 'stop', 'hold', '👎'];

function matchApprovalKeyword(text) {
  const lower = text.toLowerCase().trim();
  if (APPROVE_KEYWORDS.some(k => lower.includes(k))) return 'approved';
  if (REJECT_KEYWORDS.some(k => lower.includes(k))) return 'rejected';
  return null;
}

// ---------------------------------------------------------------------------
// CLI: send
// ---------------------------------------------------------------------------

function cmdSend(args) {
  const mediaIdx = args.indexOf('--media');
  let mediaPath = null;
  let messageParts = [...args];

  if (mediaIdx !== -1) {
    mediaPath = args[mediaIdx + 1];
    messageParts.splice(mediaIdx, 2);
  }

  const message = messageParts.join(' ');
  if (!message) {
    console.error('Usage: notify.mjs send <message> [--media <path>]');
    process.exit(1);
  }

  sendNotification(message, mediaPath);
}

// ---------------------------------------------------------------------------
// CLI: approve
// ---------------------------------------------------------------------------

function cmdApprove(args) {
  const taskIdx = args.indexOf('--task');
  const timeoutIdx = args.indexOf('--timeout');
  const mediaIdx = args.indexOf('--media');

  const taskId = taskIdx !== -1 ? args[taskIdx + 1] : null;
  const timeout = timeoutIdx !== -1 ? parseInt(args[timeoutIdx + 1], 10) : 3600;
  const mediaPath = mediaIdx !== -1 ? args[mediaIdx + 1] : null;

  // Extract message (everything that isn't a flag)
  const flagIndices = new Set();
  for (const idx of [taskIdx, timeoutIdx, mediaIdx]) {
    if (idx !== -1) { flagIndices.add(idx); flagIndices.add(idx + 1); }
  }
  const message = args.filter((_, i) => !flagIndices.has(i)).join(' ');

  if (!message) {
    console.error('Usage: notify.mjs approve <message> --task <id> [--timeout <seconds>] [--media <path>]');
    process.exit(1);
  }

  const approval = {
    id: generateApprovalId(),
    type: 'manual',
    requestedBy: 'agent',
    taskId: taskId || 'unknown',
    message,
    media: mediaPath ? [mediaPath] : [],
    status: 'pending',
    requestedAt: new Date().toISOString(),
    timeout,
    response: null,
    respondedAt: null,
  };

  saveApproval(approval);
  const fullMessage = `🔔 APPROVAL REQUESTED: ${message}${taskId ? ` (Task: ${taskId})` : ''}\n\nReply "approved" or "rejected"`;
  sendNotification(fullMessage, mediaPath);

  console.log(`📋 Approval ${approval.id} created (timeout: ${timeout}s)`);
  console.log(`   Waiting for response... Check with: node agents/notify.mjs pending`);

  // Non-blocking — agents check back with check-mailbox or pending
  // The approve command creates the request but does not block the process
}

// ---------------------------------------------------------------------------
// CLI: check-mailbox
// ---------------------------------------------------------------------------

function cmdCheckMailbox() {
  // Auto-sync inbound messages from OpenClaw before checking mailbox
  if (NOTIF.provider === 'openclaw') {
    try {
      const syncScript = resolve(dirname(fileURLToPath(import.meta.url)), 'mailbox-sync.mjs');
      if (existsSync(syncScript)) {
        execSync(`node "${syncScript}"`, { stdio: 'inherit' });
      }
    } catch { /* sync failure shouldn't block mailbox check */ }
  }

  if (!existsSync(NOTIF.mailboxPath)) {
    console.log('📭 No mailbox file found. No messages.');
    return;
  }

  const content = readFileSync(NOTIF.mailboxPath, 'utf8');
  const cursor = loadMailboxCursor();
  const messages = parseMailboxMessages(content, cursor.lastByte);

  if (messages.length === 0) {
    console.log('📭 No new messages.');
    saveMailboxCursor({ lastChecked: new Date().toISOString(), lastByte: Buffer.byteLength(content) });
    return;
  }

  console.log(`📬 ${messages.length} new message(s):\n`);

  const pendingApprovals = listApprovals('pending');

  for (const msg of messages) {
    console.log(`  [${msg.timestamp}] ${msg.text}`);

    // Try to match to a pending approval
    if (pendingApprovals.length > 0) {
      const decision = matchApprovalKeyword(msg.text);
      if (decision) {
        const target = pendingApprovals[0]; // Most recent pending
        target.status = decision;
        target.response = msg.text;
        target.respondedAt = new Date().toISOString();
        saveApproval(target);
        console.log(`  → Matched to ${target.id}: ${decision}`);
        pendingApprovals.shift(); // Remove from pending list
      } else {
        console.log(`  → No approval keyword matched (logged)`);
      }
    }
  }

  saveMailboxCursor({ lastChecked: new Date().toISOString(), lastByte: Buffer.byteLength(content) });
}

// ---------------------------------------------------------------------------
// CLI: pending
// ---------------------------------------------------------------------------

function cmdPending() {
  const pending = listApprovals('pending');

  if (pending.length === 0) {
    console.log('✅ No pending approvals.');
    return;
  }

  console.log(`⏳ ${pending.length} pending approval(s):\n`);

  for (const a of pending) {
    const elapsed = Math.round((Date.now() - new Date(a.requestedAt).getTime()) / 1000);
    const timeoutPct = Math.round((elapsed / a.timeout) * 100);
    const status = elapsed > a.timeout * 2 ? '⚠️  OVERDUE' : elapsed > a.timeout ? '⏰ REMINDER DUE' : '⏳ Waiting';

    console.log(`  ${a.id}`);
    console.log(`    Task: ${a.taskId} | Status: ${status}`);
    console.log(`    Message: ${a.message}`);
    console.log(`    Elapsed: ${elapsed}s / ${a.timeout}s (${timeoutPct}%)`);
    console.log('');
  }

  // Check for timeouts
  for (const a of pending) {
    const elapsed = (Date.now() - new Date(a.requestedAt).getTime()) / 1000;

    if (elapsed > a.timeout * 2) {
      // Double timeout — auto-approve
      a.status = 'auto-approved';
      a.autoApproved = true;
      a.autoApprovedAt = new Date().toISOString();
      a.response = 'Auto-approved after double timeout — human did not respond';
      a.respondedAt = a.autoApprovedAt;
      saveApproval(a);
      console.log(`  ⚠️  Auto-approved ${a.id} (double timeout exceeded)`);
      sendNotification(`⚠️ AUTO-APPROVED: ${a.message} (Task: ${a.taskId}) — no response after ${Math.round(elapsed)}s`);
    } else if (elapsed > a.timeout) {
      // Single timeout — send reminder
      console.log(`  ⏰ Sending reminder for ${a.id}`);
      sendNotification(`⏰ REMINDER: Approval pending — ${a.message} (Task: ${a.taskId})`);
    }
  }
}

// ---------------------------------------------------------------------------
// CLI: resolve
// ---------------------------------------------------------------------------

function cmdResolve(args) {
  const [approvalId, decision, ...rest] = args;

  if (!approvalId || !decision || !['approved', 'rejected'].includes(decision)) {
    console.error('Usage: notify.mjs resolve <approval-id> approved|rejected [--note <text>]');
    process.exit(1);
  }

  const approval = loadApproval(approvalId);
  if (!approval) {
    console.error(`❌ Approval not found: ${approvalId}`);
    process.exit(1);
  }

  if (approval.status !== 'pending') {
    console.error(`❌ Approval ${approvalId} is already ${approval.status}`);
    process.exit(1);
  }

  const noteIdx = rest.indexOf('--note');
  const note = noteIdx !== -1 ? rest.slice(noteIdx + 1).join(' ') : '';

  approval.status = decision;
  approval.response = note || decision;
  approval.respondedAt = new Date().toISOString();
  saveApproval(approval);

  const icon = decision === 'approved' ? '✅' : '❌';
  console.log(`${icon} ${approvalId} → ${decision}${note ? ': ' + note : ''}`);
}

// ---------------------------------------------------------------------------
// CLI: status
// ---------------------------------------------------------------------------

function cmdStatus() {
  console.log(`📡 Notification Channel Status`);
  console.log(`${'─'.repeat(40)}`);
  console.log(`  Provider: ${NOTIF.provider}`);
  console.log(`  Channel:  ${NOTIF.channel || '(not set)'}`);
  console.log(`  Mailbox:  ${NOTIF.mailboxPath}`);
  console.log(`  Media:    ${NOTIF.mediaDir}`);
  console.log(`  Approvals: ${NOTIF.approvalsDir}`);

  // Check provider health
  switch (NOTIF.provider) {
    case 'openclaw': {
      try {
        execSync('which openclaw', { stdio: 'pipe' });
        // Check if openclaw is running
        try {
          execSync('openclaw status', { stdio: 'pipe', timeout: 5000 });
          console.log(`\n  ✅ OpenClaw: healthy`);
        } catch {
          console.log(`\n  ⚠️  OpenClaw CLI found but service may not be running`);
        }
      } catch {
        console.log(`\n  ❌ OpenClaw CLI not found in PATH`);
        process.exit(1);
      }
      break;
    }
    case 'file': {
      try {
        const dir = dirname(NOTIF.mailboxPath);
        if (!existsSync(dir)) {
          console.log(`\n  ⚠️  Mailbox directory does not exist: ${dir} (will be created on first send)`);
        } else {
          console.log(`\n  ✅ File provider: ready`);
        }
      } catch {
        console.log(`\n  ❌ File provider: error checking mailbox path`);
        process.exit(1);
      }
      break;
    }
    case 'none':
    default:
      console.log(`\n  ℹ️  No provider configured — notifications print to stdout only`);
      break;
  }

  // Show trigger config
  const triggers = NOTIF.triggers;
  if (Object.keys(triggers).length > 0) {
    console.log(`\n  Triggers:`);
    for (const [trigger, enabled] of Object.entries(triggers)) {
      console.log(`    ${enabled ? '✅' : '⬜'} ${trigger}`);
    }
  } else {
    console.log(`\n  Triggers: none configured`);
  }

  // Show pending approvals count
  const pending = listApprovals('pending');
  if (pending.length > 0) {
    console.log(`\n  ⏳ ${pending.length} pending approval(s)`);
  }
}

// ---------------------------------------------------------------------------
// Exported trigger helpers (for use by other scripts)
// ---------------------------------------------------------------------------

export function triggerNotification(triggerName, message, mediaPath) {
  if (!NOTIF.triggers[triggerName]) return false;
  return sendNotification(message, mediaPath);
}

export { sendNotification, loadApproval, saveApproval, listApprovals, NOTIF };

// ---------------------------------------------------------------------------
// CLI router
// ---------------------------------------------------------------------------

const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'send':
    cmdSend(args);
    break;
  case 'approve':
    cmdApprove(args);
    break;
  case 'check-mailbox':
    cmdCheckMailbox();
    break;
  case 'pending':
    cmdPending();
    break;
  case 'resolve':
    cmdResolve(args);
    break;
  case 'status':
    cmdStatus();
    break;
  default:
    console.log(`Notification & Approval Layer

Usage:
  notify.mjs send <message> [--media <path>]         Send a notification
  notify.mjs approve <message> --task <id> [opts]     Request human approval
  notify.mjs check-mailbox                            Parse inbound messages
  notify.mjs pending                                  List pending approvals
  notify.mjs resolve <id> approved|rejected [--note]  Manually resolve approval
  notify.mjs status                                   Check provider health

Options for approve:
  --task <id>        Task ID this approval relates to
  --timeout <secs>   Timeout in seconds (default: 3600)
  --media <path>     Attach a file (screenshot, etc.)

Providers (set in project.json → notification.provider):
  openclaw           Send via OpenClaw/WhatsApp
  file               Append to local mailbox file
  none               Print to stdout (default)`);
}
