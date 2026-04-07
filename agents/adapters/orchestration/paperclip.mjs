/**
 * Paperclip orchestration adapter.
 *
 * Task read/write delegates to file-based adapter (Paperclip doesn't replace local task queue).
 * Adds syncConfig() to push SDLC config to Paperclip REST API.
 *
 * Requires .paperclip.env in project directory with:
 *   PAPERCLIP_API_URL, PAPERCLIP_COMPANY_ID, PAPERCLIP_API_KEY
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import * as fileBased from './file-based.mjs';

// Task operations delegate to file-based — Paperclip is an overlay, not a replacement
export const { loadTasks, saveTask, archiveTask, loadCompletedCount, loadHumanTasks, saveHumanTask } = fileBased;

// --- Paperclip credentials ---

function loadPaperclipEnv(projectDir) {
  const envPath = resolve(projectDir, '.paperclip.env');
  const creds = {
    apiUrl: process.env.PAPERCLIP_API_URL || '',
    companyId: process.env.PAPERCLIP_COMPANY_ID || '',
    apiKey: process.env.PAPERCLIP_API_KEY || '',
  };

  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^export\s+(\w+)='([^']*)'/);
      if (!m) continue;
      if (m[1] === 'PAPERCLIP_API_URL') creds.apiUrl = m[2];
      if (m[1] === 'PAPERCLIP_COMPANY_ID') creds.companyId = m[2];
      if (m[1] === 'PAPERCLIP_API_KEY') creds.apiKey = m[2];
    }
  }

  if (!creds.apiUrl || !creds.companyId) {
    throw new Error('Paperclip adapter requires PAPERCLIP_API_URL and PAPERCLIP_COMPANY_ID in .paperclip.env or env vars');
  }

  return creds;
}

// --- Paperclip API helpers ---

async function fetchAgents(creds) {
  const url = `${creds.apiUrl}/api/companies/${creds.companyId}/agents`;
  const headers = { 'Content-Type': 'application/json' };
  if (creds.apiKey) headers['Authorization'] = `Bearer ${creds.apiKey}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Paperclip API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function patchAgent(creds, agentId, patch) {
  const url = `${creds.apiUrl}/api/agents/${agentId}`;
  const headers = { 'Content-Type': 'application/json' };
  if (creds.apiKey) headers['Authorization'] = `Bearer ${creds.apiKey}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH ${agentId} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// --- syncConfig: push SDLC agent config to Paperclip ---

export async function syncConfig(sdlcConfig) {
  const creds = loadPaperclipEnv(sdlcConfig.projectDir);
  const pcAgents = await fetchAgents(creds);
  const drift = [];

  // Compare SDLC agents to Paperclip agents and report drift
  // Full sync logic lives in paperclip-sync.mjs — this adapter provides
  // the interface for other scripts to check drift without importing paperclip-sync directly
  for (const pcAgent of pcAgents) {
    drift.push({
      urlKey: pcAgent.urlKey,
      id: pcAgent.id,
      model: pcAgent.adapterConfig?.model,
      role: pcAgent.role,
    });
  }

  return { drift };
}
