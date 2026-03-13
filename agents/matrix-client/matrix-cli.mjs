#!/usr/bin/env node
/**
 * Matrix CLI for LinguaFlow agent communication.
 * Usage:
 *   matrix-cli.mjs send <agent> <room> <message>
 *   matrix-cli.mjs read <agent> <room> [--limit N]
 *   matrix-cli.mjs rooms <agent>
 *   matrix-cli.mjs status <agent> <room> <status_json>
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'http';
import { loadConfig } from '../load-config.mjs';

// Optional schema validation for structured messages
let validate;
try {
  const sv = await import('../schema-validator.mjs');
  validate = sv.validate;
} catch { validate = null; }

const config = loadConfig();
const CREDS_PATH = config.credentialsPath;
const SERVER = config.matrixServer;
const DOMAIN = config.matrixDomain;

const ROOM_ALIASES = {
  general: `#general:${DOMAIN}`,
  backend: `#backend:${DOMAIN}`,
  frontend: `#frontend:${DOMAIN}`,
  'ai-pipeline': `#ai-pipeline:${DOMAIN}`,
  releases: `#releases:${DOMAIN}`,
  reviews: `#reviews:${DOMAIN}`,
  docs: `#docs:${DOMAIN}`,
};

function loadCreds() {
  return JSON.parse(readFileSync(CREDS_PATH, 'utf8'));
}

function getToken(agent) {
  const creds = loadCreds();
  if (!creds[agent]) {
    console.error(`Unknown agent: ${agent}. Available: ${Object.keys(creds).join(', ')}`);
    process.exit(1);
  }
  return creds[agent].access_token;
}

async function matrixRequest(method, path, token, body = null) {
  const url = `${SERVER}${path}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function resolveRoom(token, roomName) {
  const alias = ROOM_ALIASES[roomName];
  if (!alias) {
    console.error(`Unknown room: ${roomName}. Available: ${Object.keys(ROOM_ALIASES).join(', ')}`);
    process.exit(1);
  }
  const encoded = encodeURIComponent(alias);
  const data = await matrixRequest('GET', `/_matrix/client/v3/directory/room/${encoded}`, token);
  return data.room_id;
}

// Schema mapping for structured messages sent to specific rooms
const ROOM_SCHEMAS = {
  reviews: { outbound: 'review-request', inbound: 'review-result' },
  releases: { outbound: 'deploy-request' },
};

/**
 * Validate a structured JSON message against the appropriate schema for its room.
 * Returns { valid, warning?, errors? } or null if no schema applies.
 */
async function validateStructuredMessage(room, message, direction = 'outbound') {
  if (!validate) return null;
  const mapping = ROOM_SCHEMAS[room];
  if (!mapping || !mapping[direction]) return null;

  // Only validate if the message looks like JSON
  let parsed;
  try {
    parsed = typeof message === 'string' ? JSON.parse(message) : message;
  } catch {
    return null; // Plain text message, no validation needed
  }

  return validate(mapping[direction], parsed);
}

async function send(agent, room, message) {
  const token = getToken(agent);
  const roomId = await resolveRoom(token, room);

  // Validate structured messages before sending
  const validation = await validateStructuredMessage(room, message, 'outbound');
  if (validation && !validation.valid) {
    console.warn(`⚠ Schema validation warning for #${room}:`, validation.errors?.map(e => `${e.field}: ${e.message}`).join(', '));
  }

  const txnId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const result = await matrixRequest('PUT',
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
    token,
    { msgtype: 'm.text', body: message }
  );
  console.log(`[${agent}] → #${room}: ${message}`);
  return result;
}

async function read(agent, room, limit = 10) {
  const token = getToken(agent);
  const roomId = await resolveRoom(token, room);
  const data = await matrixRequest('GET',
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?limit=${limit}&dir=b`,
    token
  );
  const messages = (data.chunk || []).reverse();
  for (const event of messages) {
    if (event.type === 'm.room.message') {
      const sender = event.sender.split(':')[0].replace('@', '');
      const body = event.content?.body || '';
      const time = new Date(event.origin_server_ts).toLocaleTimeString();
      console.log(`[${time}] ${sender}: ${body}`);
    }
  }
  return messages;
}

async function listRooms(agent) {
  const token = getToken(agent);
  const data = await matrixRequest('GET', '/_matrix/client/v3/joined_rooms', token);
  console.log(`Rooms for ${agent}:`);
  for (const roomId of data.joined_rooms || []) {
    const state = await matrixRequest('GET',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.name/`,
      token
    );
    console.log(`  ${state.name || roomId} (${roomId})`);
  }
}

// CLI entry point
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'send':
    await send(args[0], args[1], args.slice(2).join(' '));
    break;
  case 'read':
    const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 10;
    await read(args[0], args[1], limit);
    break;
  case 'rooms':
    await listRooms(args[0]);
    break;
  default:
    console.log(`Usage:
  matrix-cli.mjs send <agent> <room> <message>
  matrix-cli.mjs read <agent> <room> [--limit N]
  matrix-cli.mjs rooms <agent>

Agents: (as defined in your project's credentials file)
Rooms: general, backend, frontend, ai-pipeline, releases, reviews, docs`);
}
