#!/usr/bin/env node

/**
 * Standalone Autonomous Worker for Agent Council
 *
 * Runs a single work cycle without Claude Code:
 *   1. Check for planned meetings → run them
 *   2. Check for active action items → log them
 *   3. If nothing to do → run a meeting on a useful topic
 *   4. Log what happened
 *
 * Requirements:
 *   - Agent Council dev server running on localhost:3003
 *   - ANTHROPIC_API_KEY in .env.local (or environment)
 *
 * Usage:
 *   node scripts/worker.mjs                # single work cycle
 *   node scripts/worker.mjs --dry-run      # show what would happen, don't act
 *   node scripts/worker.mjs --port 3003    # custom port
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOG_FILE = path.join(PROJECT_ROOT, '.council-worker-log.md');

// Parse args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const portIdx = args.indexOf('--port');
const PORT = portIdx !== -1 ? args[portIdx + 1] : (process.env.COUNCIL_PORT || '3003');
const BASE_URL = `http://localhost:${PORT}`;

// Load .env.local if present (for ANTHROPIC_API_KEY detection)
loadEnvFile(path.join(PROJECT_ROOT, '.env.local'));

// ─── HTTP helpers ────────────────────────────────────────────────

function request(pathStr, method = 'GET', body = null, timeoutMs = 300_000) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathStr, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: timeoutMs,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          try {
            const parsed = JSON.parse(data);
            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          } catch {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          }
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Cannot reach ${BASE_URL}: ${err.message}`));
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms: ${method} ${pathStr}`));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ─── Work cycle steps ────────────────────────────────────────────

async function checkPlannedMeetings() {
  try {
    const result = await request('/api/council/planned');
    const pending = (result.meetings || []).filter(m => m.status === 'planned');
    return pending;
  } catch (err) {
    log(`  Warning: Could not fetch planned meetings: ${err.message}`);
    return [];
  }
}

async function checkWorkItems() {
  try {
    const result = await request('/api/roadmap');
    const items = result.items || [];
    const active = items.filter(i => i.type === 'ACTION' && i.itemStatus === 'active');
    const open = items.filter(i => i.type === 'OPEN' && i.itemStatus === 'active');
    return { active, open, counts: result.counts };
  } catch (err) {
    log(`  Warning: Could not fetch work items: ${err.message}`);
    return { active: [], open: [], counts: {} };
  }
}

async function runMeeting(topic, agents, type = 'direction-check', rounds = 1) {
  log(`  Running meeting: "${topic}"`);
  log(`  Agents: ${agents.join(', ')} | Type: ${type} | Rounds: ${rounds}`);

  if (DRY_RUN) {
    log('  [DRY RUN] Would call POST /api/council/multi-consult');
    return { meetingFile: '(dry-run)', outcomes: {} };
  }

  // Use async mode with polling for long meetings
  const result = await request('/api/council/multi-consult', 'POST', {
    topic,
    agents,
    type,
    rounds,
    writeMeeting: true,
    async: true,
  });

  if (result.jobId) {
    log(`  Job started: ${result.jobId}`);
    return await pollJob(result.jobId);
  }

  // Sync response (shouldn't happen with async: true, but handle it)
  return result;
}

async function pollJob(jobId, intervalMs = 5000, maxWaitMs = 600_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await sleep(intervalMs);
    try {
      const status = await request(`/api/council/job-status/${jobId}`, 'GET', null, 10_000);
      if (status.status === 'complete') {
        log(`  Meeting complete (${Math.round(status.elapsed / 1000)}s)`);
        return status.result;
      }
      if (status.status === 'failed') {
        throw new Error(`Meeting failed: ${status.error}`);
      }
      // Still running
      if (status.progress) {
        log(`  Progress: ${status.progress}`);
      }
    } catch (err) {
      if (err.message.includes('404') || err.message.includes('not found')) {
        throw new Error(`Job ${jobId} not found (expired?)`);
      }
      // Transient error, keep polling
      log(`  Poll error (retrying): ${err.message}`);
    }
  }
  throw new Error(`Meeting timed out after ${maxWaitMs / 1000}s`);
}

async function logActivity(summary, detail, linkedMeeting) {
  if (DRY_RUN) return;
  try {
    await request('/api/activity', 'POST', {
      source: 'worker',
      type: 'worker_run',
      summary,
      detail,
      ...(linkedMeeting ? { linkedMeeting } : {}),
    });
  } catch (err) {
    log(`  Warning: Could not log activity: ${err.message}`);
  }
}

async function markPlannedMeeting(id, status) {
  if (DRY_RUN) return;
  try {
    await request('/api/council/planned', 'PATCH', { id, status });
  } catch (err) {
    log(`  Warning: Could not update planned meeting ${id}: ${err.message}`);
  }
}

// ─── Topic selection ─────────────────────────────────────────────

const EXPLORATION_TOPICS = [
  {
    topic: 'How should Agent Council handle projects with different programming languages and frameworks? What assumptions are baked in that only work for TypeScript/Next.js?',
    agents: ['architect', 'critic', 'project-manager'],
    type: 'design-review',
  },
  {
    topic: 'What would make the meeting viewer more useful during a live meeting? What information is missing, what is distracting, and what would help a user trust the process?',
    agents: ['designer', 'critic', 'north-star'],
    type: 'design-review',
  },
  {
    topic: 'How could meeting outcomes be more actionable? Current tags ([DECISION], [ACTION], [OPEN]) capture conclusions but not rationale, priority, or dependencies. What structured metadata would make outcomes more useful?',
    agents: ['architect', 'project-manager', 'critic'],
    type: 'strategy',
  },
  {
    topic: 'What does a good onboarding experience look like for someone connecting Agent Council to their project for the first time? What should happen automatically vs. require user input?',
    agents: ['designer', 'north-star', 'project-manager'],
    type: 'design-review',
  },
  {
    topic: 'How should Agent Council handle conflicting or outdated meeting decisions? When a new meeting contradicts an old decision, what is the resolution process?',
    agents: ['architect', 'critic', 'project-manager'],
    type: 'strategy',
  },
];

function pickTopic(recentMeetings) {
  // Avoid topics that overlap with recent meeting titles
  const recentTitles = recentMeetings.map(m => (m.title || '').toLowerCase()).join(' ');
  const candidates = EXPLORATION_TOPICS.filter(t => {
    const keywords = t.topic.split(' ').slice(0, 5).join(' ').toLowerCase();
    return !recentTitles.includes(keywords.slice(0, 20));
  });
  if (candidates.length === 0) return EXPLORATION_TOPICS[0];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ─── Main work cycle ─────────────────────────────────────────────

async function workCycle() {
  const startTime = Date.now();
  log('=== Worker Cycle Start ===');
  log(`Time: ${new Date().toISOString()}`);
  log(`Server: ${BASE_URL}`);
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  // Verify server is reachable
  try {
    await request('/api/health', 'GET', null, 5000);
    log('  Server: reachable');
  } catch {
    log('  ERROR: Agent Council server not reachable. Start it with: npm run dev');
    process.exit(1);
  }

  // Check LLM availability
  try {
    const llmStatus = await request('/api/council/llm-status', 'GET', null, 5000);
    log(`  LLM backend: ${llmStatus.backend} (${llmStatus.available ? 'available' : 'unavailable'})`);
    if (!llmStatus.available) {
      log('  ERROR: No LLM backend available. Set ANTHROPIC_API_KEY in .env.local');
      process.exit(1);
    }
  } catch {
    log('  Warning: Could not check LLM status (endpoint may not exist)');
  }

  let didWork = false;
  let summary = '';

  // Step 1: Check planned meetings
  log('\n--- Step 1: Planned Meetings ---');
  const planned = await checkPlannedMeetings();
  if (planned.length > 0) {
    const meeting = planned[0]; // Take the first one
    log(`  Found planned meeting: "${meeting.topic}" (${meeting.type})`);
    await markPlannedMeeting(meeting.id, 'running');

    try {
      const result = await runMeeting(
        meeting.topic,
        meeting.participants || ['project-manager', 'critic', 'north-star'],
        meeting.type || 'direction-check',
        1,
      );
      await markPlannedMeeting(meeting.id, 'done');
      const outcomeCount = countOutcomes(result.outcomes);
      summary = `Ran planned meeting: "${meeting.topic}" → ${outcomeCount}`;
      await logActivity(summary, null, result.meetingFile);
      didWork = true;
    } catch (err) {
      log(`  Meeting failed: ${err.message}`);
      await markPlannedMeeting(meeting.id, 'planned'); // Reset
      summary = `Planned meeting failed: ${err.message}`;
    }
  } else {
    log('  No planned meetings');
  }

  // Step 2: Check work items
  log('\n--- Step 2: Work Items ---');
  const { active, open, counts } = await checkWorkItems();
  log(`  Actions: ${active.length} active, Open questions: ${open.length}`);
  if (active.length > 0) {
    log('  Active actions:');
    for (const item of active.slice(0, 5)) {
      log(`    - ${item.text.slice(0, 100)}`);
    }
  }

  // Step 3: If no planned meeting was run, pick a topic
  if (!didWork) {
    log('\n--- Step 3: Exploratory Meeting ---');

    // Get recent meetings to avoid repeating topics
    let recentMeetings = [];
    try {
      recentMeetings = await request('/api/meetings');
      if (Array.isArray(recentMeetings)) {
        recentMeetings = recentMeetings.slice(0, 10);
      }
    } catch { /* ignore */ }

    const topic = pickTopic(recentMeetings);
    try {
      const result = await runMeeting(topic.topic, topic.agents, topic.type, 1);
      const outcomeCount = countOutcomes(result.outcomes);
      summary = `Ran exploratory meeting (${topic.type}): "${topic.topic.slice(0, 80)}..." → ${outcomeCount}`;
      await logActivity(summary, null, result.meetingFile);
      didWork = true;
    } catch (err) {
      log(`  Meeting failed: ${err.message}`);
      summary = `Exploratory meeting failed: ${err.message}`;
    }
  }

  // Done
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  log(`\n=== Worker Cycle End (${elapsed}s) ===`);
  log(`Result: ${summary || 'No work done'}`);

  // Append to work log
  appendWorkLog(summary || 'Cycle completed with no actionable work', elapsed);

  return { didWork, summary, elapsed };
}

// ─── Utilities ───────────────────────────────────────────────────

function log(msg) {
  console.log(msg);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function countOutcomes(outcomes) {
  if (!outcomes) return 'no outcomes';
  const parts = [];
  if (outcomes.decisions?.length) parts.push(`${outcomes.decisions.length} decisions`);
  if (outcomes.actions?.length) parts.push(`${outcomes.actions.length} actions`);
  if (outcomes.openQuestions?.length) parts.push(`${outcomes.openQuestions.length} open questions`);
  return parts.join(', ') || 'no outcomes';
}

function appendWorkLog(summary, elapsedSec) {
  if (DRY_RUN) return;
  const timestamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const entry = `\n## ${timestamp}\n- **What I did:** [standalone worker] ${summary}\n- **Result:** Cycle completed in ${elapsedSec}s\n- **Next:** Automated — will run again on next invocation\n`;

  try {
    if (fs.existsSync(LOG_FILE)) {
      // Read existing, prepend new entry after the header
      const content = fs.readFileSync(LOG_FILE, 'utf-8');
      const lines = content.split('\n');
      const headerEnd = lines.findIndex((l, i) => i > 0 && l.startsWith('## '));
      if (headerEnd > 0) {
        lines.splice(headerEnd, 0, ...entry.split('\n'));

        // Trim to 50 entries
        let entryCount = 0;
        let cutoff = lines.length;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('## ')) {
            entryCount++;
            if (entryCount > 50) { cutoff = i; break; }
          }
        }
        fs.writeFileSync(LOG_FILE, lines.slice(0, cutoff).join('\n'));
      } else {
        fs.appendFileSync(LOG_FILE, entry);
      }
    } else {
      fs.writeFileSync(LOG_FILE, `# Council Autonomous Worker Log\n${entry}`);
    }
  } catch (err) {
    log(`Warning: Could not update work log: ${err.message}`);
  }
}

function loadEnvFile(filepath) {
  try {
    if (!fs.existsSync(filepath)) return;
    const content = fs.readFileSync(filepath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      // Strip quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch { /* ignore */ }
}

// ─── Run ─────────────────────────────────────────────────────────

workCycle()
  .then(({ didWork, elapsed }) => {
    process.exit(didWork ? 0 : 0);
  })
  .catch((err) => {
    console.error(`Worker error: ${err.message}`);
    process.exit(1);
  });
