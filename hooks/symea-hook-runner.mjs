#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const DEFAULT_URL = 'https://symea-brain-239495878487.europe-west2.run.app';
const SYMEA_TOOL_TAIL_RE = /^(authenticated_context|conversation_capture_report|search_memory|get_memory|inspect_schema|memory_history|get_relationships|schema_change_requests|audit_trail|hybrid_search|get_document|get_documents_batch|get_document_download_url|lookup_sku|search_compliance_dops|check_dnc_account|get_market_indices|list_conflicts|list_topic_dossiers|get_topic_dossier|capture_memory|preview_conversation_capture|commit_conversation_capture|correct_memory|link_entities|request_schema_change|upsert_pim_sku|ingest_document|upsert_dnc_account|record_conflict|resolve_conflict|capture_compartment_note|upsert_topic_dossier|hook_prompt_submit|hook_post_connector|hook_turn_stop|list_auto_inbox|review_auto_inbox|setup_local_hooks|list_skill_trees|get_skill_tree|run_skill_formula|list_skill_proposals|distill_artifact_to_playbook|upsert_skill_node|review_skill_proposal|rollback_skill_revision|record_skill_feedback|run_sop_agent|export_agent_pack)$/;
const LOCAL_NOISE_RE = /^(read_file|write_file|edit_file|view_file|write_to_file|replace_file_content|multi_replace_file_content|list_dir|find_by_name|grep_search|run_command|command_status|send_command_input|read_terminal|task_boundary|notify_user|manage_task|schedule|ask_question|Read|Write|Edit|MultiEdit|Glob|Grep|LS|Bash|Agent|Task|TodoWrite|NotebookEdit|apply_patch|shell|exec_command|write_stdin)$/;

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--platform' && argv[i + 1]) out.platform = argv[++i];
    else if (argv[i] === '--event' && argv[i + 1]) out.event = argv[++i];
  }
  return out;
}

function readStdinSafe(timeoutMs = 2000) {
  return new Promise(resolve => {
    let buf = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(buf);
    };
    const timer = setTimeout(finish, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { buf += chunk; });
    process.stdin.on('end', () => { clearTimeout(timer); finish(); });
    process.stdin.on('error', () => { clearTimeout(timer); finish(); });
  });
}

function writeOut(obj) {
  writeSync(1, JSON.stringify(obj));
}

function noopFor(platform, event) {
  if (platform === 'antigravity') return event === 'turn-stop' ? { decision: 'stop' } : {};
  return { continue: true };
}

function readHookConfig() {
  const cfgPath = process.env.SYMEA_HOOK_CONFIG_PATH || join(homedir(), '.config', 'symea-brain', 'hook-token.json');
  let fileCfg = {};
  try {
    if (existsSync(cfgPath)) fileCfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  } catch {}
  return {
    token: String(process.env.SYMEA_BRAIN_HOOK_TOKEN || fileCfg.token || '').trim(),
    url: String(process.env.SYMEA_BRAIN_URL || fileCfg.url || DEFAULT_URL).trim().replace(/\/+$/, '')
  };
}

function hookCfgDir() {
  return dirname(process.env.SYMEA_HOOK_CONFIG_PATH || join(homedir(), '.config', 'symea-brain', 'hook-token.json'));
}

function saveHookTokenFile(token, url) {
  const dir = hookCfgDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = process.env.SYMEA_HOOK_CONFIG_PATH || join(dir, 'hook-token.json');
  writeFileSync(p, `${JSON.stringify({ token, url }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  try { chmodSync(p, 0o600); } catch {}
}

async function pollPendingDevice(pendingP, pObj) {
  try {
    const pr = await fetch(`${pObj.url}/api/hooks/device/poll`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ poll_ticket: pObj.poll_ticket }), signal: AbortSignal.timeout(2500)
    });
    if (pr.status === 410) { rmSync(pendingP, { force: true }); return { token: '' }; }
    if (!pr.ok) return { token: '' };
    const pj = await pr.json();
    if (pj.status === 'approved' && pj.token) {
      saveHookTokenFile(pj.token, pObj.url);
      rmSync(pendingP, { force: true });
      return { token: pj.token, url: pObj.url };
    }
  } catch {}
  return { token: '' };
}

async function tryDeviceAuth({ platform, event, url }) {
  if ((process.env.SYMEA_DISABLE_AUTO_AUTH === '1' || process.env.CI || process.env.NODE_TEST_CONTEXT) && process.env.SYMEA_FORCE_DEVICE_AUTH !== '1') return { token: '' };
  const dir = hookCfgDir();
  const pendingP = join(dir, 'pending-device.json');
  const nowSec = Math.floor(Date.now() / 1000);
  let pending = null;
  try { if (existsSync(pendingP)) pending = JSON.parse(readFileSync(pendingP, 'utf8')); } catch {}
  if (pending?.poll_ticket && Number(pending.exp || 0) > nowSec) {
    return await pollPendingDevice(pendingP, pending);
  }
  if (pending) rmSync(pendingP, { force: true });
  if (event !== 'session-start' || process.platform !== 'darwin') return { token: '' };
  try {
    const sr = await fetch(`${url}/api/hooks/device/start`, { method: 'POST', signal: AbortSignal.timeout(2500) });
    if (!sr.ok) return { token: '' };
    const sj = await sr.json();
    const nextP = { poll_ticket: sj.poll_ticket, url, exp: nowSec + Number(sj.expires_in_seconds || 900) };
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(pendingP, JSON.stringify(nextP), { encoding: 'utf8', mode: 0o600 });
    try { chmodSync(pendingP, 0o600); } catch {}
    if (process.env.SYMEA_DISABLE_OPEN !== '1') spawn('open', [sj.approve_url], { detached: true, stdio: 'ignore' }).unref();
    await new Promise(r => setTimeout(r, 3000));
    const quick = await pollPendingDevice(pendingP, nextP);
    if (quick.token) return quick;
    const msg = 'Symea Brain: browser tab opened. Click Approve once to activate automatic hooks.';
    return { token: '', notice: platform === 'antigravity' ? { injectSteps: [{ systemMessage: { systemMessage: msg } }] } : { continue: true, systemMessage: msg } };
  } catch {
    return { token: '' };
  }
}

function extractTailFromTranscript(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return {};
  try {
    const size = statSync(transcriptPath).size;
    const readSize = Math.min(size, 131072);
    const fd = openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(readSize);
    readSync(fd, buf, 0, readSize, Math.max(0, size - readSize));
    closeSync(fd);
    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    let lastUser = '', lastAssistant = '';
    for (const ln of lines) {
      let row;
      try { row = JSON.parse(ln); } catch { continue; }
      const role = row.role || row.type || row.message?.role || '';
      const rawContent = row.content ?? row.message?.content ?? row.parts ?? row.message?.parts ?? row.text ?? '';
      const txt = typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent.map(p => (typeof p === 'string' ? p : p?.text || '')).filter(Boolean).join('\n')
          : '';
      if (!txt) continue;
      if (role === 'user') lastUser = txt;
      else if (role === 'assistant' || role === 'model') lastAssistant = txt;
    }
    return { lastUser, lastAssistant };
  } catch {
    return {};
  }
}

function detectPlatform(args, payload) {
  const p = String(args.platform || process.env.SYMEA_HOOK_PLATFORM || '').toLowerCase();
  if (['codex', 'claude', 'antigravity'].includes(p)) return p;
  if (payload && (payload.hookEventName || payload.conversationId || 'lastUserInput' in payload)) return 'antigravity';
  if (process.env.PLUGIN_DATA || process.env.CODEX_HOME || process.env.CODEX_CI || process.env.CODEX_THREAD_ID || String(process.env.CLAUDE_PLUGIN_ROOT || '').includes('/.codex/')) return 'codex';
  if (process.env.CLAUDE_PLUGIN_ROOT || process.env.CLAUDE_PROJECT_DIR) return 'claude';
  return 'claude';
}

function detectEvent(args, payload) {
  if (args.event) return String(args.event).toLowerCase();
  const ev = String(payload?.hook_event_name || payload?.hookEventName || '').toLowerCase();
  if (ev === 'sessionstart') return 'session-start';
  if (ev === 'userpromptsubmit' || ev === 'preinvocation') return 'prompt-submit';
  if (ev === 'posttooluse') return 'post-connector';
  if (ev === 'stop') return 'turn-stop';
  return 'prompt-submit';
}

function isSkippedSymeaTool(toolName) {
  const raw = String(toolName || '').trim();
  if (!raw) return false;
  if (/symea[-_]?brain/i.test(raw) || /^mcp__symea/i.test(raw)) return true;
  const tail = raw.includes('__') ? raw.split('__').pop() : raw.includes(':') ? raw.split(':').pop() : raw.includes('.') ? raw.split('.').pop() : raw;
  return SYMEA_TOOL_TAIL_RE.test(tail) || LOCAL_NOISE_RE.test(raw) || LOCAL_NOISE_RE.test(tail);
}

async function main() {
  const args = parseArgs(process.argv);
  const rawIn = await readStdinSafe();
  let payload = {};
  if (rawIn.trim()) {
    try { payload = JSON.parse(rawIn.replace(/^\uFEFF/, '')); } catch { payload = {}; }
  }
  const platform = detectPlatform(args, payload);
  const event = detectEvent(args, payload);
  const noop = noopFor(platform, event);

  const isTrue = v => v === true || v === 1 || ['true', '1', 'yes'].includes(String(v ?? '').trim().toLowerCase());
  if (event === 'turn-stop' && (isTrue(payload.stop_hook_active) || isTrue(payload.continuationActive))) {
    writeOut(noop);
    return process.exit(0);
  }
  if (event === 'post-connector') {
    const tName = payload.tool_name || payload.toolName || payload.toolCall?.name || '';
    if (isSkippedSymeaTool(tName)) {
      writeOut(noop);
      return process.exit(0);
    }
  }
  if (event === 'prompt-submit') {
    const prompt = String(payload.prompt ?? payload.lastUserInput ?? payload.user_prompt ?? payload.userPrompt ?? payload.query ?? '').trim();
    if (prompt.length < 12) {
      writeOut(noop);
      return process.exit(0);
    }
  }

  let { token, url } = readHookConfig();
  if (!token) {
    const auth = await tryDeviceAuth({ platform, event, url });
    token = auth.token || '';
    if (auth.url) url = auth.url;
    if (!token) {
      writeOut(auth.notice || noop);
      return process.exit(0);
    }
  }

  const statePath = join(hookCfgDir(), 'session-state.json');
  const readSticky = () => {
    try { return existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {}; } catch { return {}; }
  };
  const writeSticky = st => {
    try { mkdirSync(hookCfgDir(), { recursive: true, mode: 0o700 }); writeFileSync(statePath, JSON.stringify(st), { encoding: 'utf8', mode: 0o600 }); } catch {}
  };

  const outbound = { ...payload };
  const sticky = readSticky();
  if (event === 'turn-stop') {
    if (Number(sticky.turns_left || 0) > 0) {
      if (sticky.last_org_slug && !outbound.sticky_org_slug) outbound.sticky_org_slug = sticky.last_org_slug;
      if (sticky.last_skill_slug && !outbound.sticky_skill_slug) outbound.sticky_skill_slug = sticky.last_skill_slug;
      if (sticky.last_node_path && !outbound.sticky_node_path) outbound.sticky_node_path = sticky.last_node_path;
      if (sticky.session_key && !outbound.session_key) outbound.session_key = sticky.session_key;
      writeSticky({ ...sticky, turns_left: Math.max(0, Number(sticky.turns_left) - 1) });
    }
    if (!outbound.last_assistant_message || (!outbound.prompt && !outbound.lastUserInput)) {
      const tail = extractTailFromTranscript(outbound.transcript_path || outbound.transcriptPath);
      if (!outbound.last_assistant_message && tail.lastAssistant) outbound.last_assistant_message = tail.lastAssistant;
      if (!outbound.prompt && !outbound.lastUserInput && tail.lastUser) outbound.prompt = tail.lastUser;
    }
  }

  try {
    const res = await fetch(`${url}/api/hooks/${encodeURIComponent(event)}?platform=${encodeURIComponent(platform)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(outbound),
      signal: AbortSignal.timeout(event === 'turn-stop' ? 12000 : 8500)
    });
    if (!res.ok) {
      writeOut(noop);
      return process.exit(0);
    }
    const json = await res.json();
    if (event === 'prompt-submit') {
      const txt = JSON.stringify(json || {});
      const sm = /SKILL TREE \[([a-z0-9_-]+)/i.exec(txt);
      const om = /\[(symea|syskern|amplify|elendil|unikkern)\//i.exec(txt);
      const nm = /(branches\/[a-z0-9._/-]+\.md|formulas\/[a-z0-9._/-]+\.js)/i.exec(txt);
      if (sm || om || nm) {
        writeSticky({
          last_org_slug: om ? om[1] : (sticky.last_org_slug || 'symea'),
          last_skill_slug: sm ? sm[1] : (sticky.last_skill_slug || null),
          last_node_path: nm ? nm[1] : (sticky.last_node_path || null),
          session_key: outbound.session_id || outbound.conversationId || sticky.session_key || null,
          turns_left: 6
        });
      }
    }
    writeOut(json && typeof json === 'object' ? json : noop);
  } catch {
    writeOut(noop);
  }
  process.exit(0);
}

main().catch(() => {
  writeOut({ continue: true });
  process.exit(0);
});
