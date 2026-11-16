#!/usr/bin/env node
import { existsSync, readFileSync, statSync, openSync, readSync, closeSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_URL = 'https://symea-brain-239495878487.europe-west2.run.app';
const SYMEA_TOOL_TAIL_RE = /^(authenticated_context|conversation_capture_report|search_memory|get_memory|inspect_schema|memory_history|get_relationships|schema_change_requests|audit_trail|hybrid_search|get_document|get_documents_batch|get_document_download_url|lookup_sku|search_compliance_dops|check_dnc_account|get_market_indices|list_conflicts|list_topic_dossiers|get_topic_dossier|capture_memory|preview_conversation_capture|commit_conversation_capture|correct_memory|link_entities|request_schema_change|upsert_pim_sku|ingest_document|upsert_dnc_account|record_conflict|resolve_conflict|capture_compartment_note|upsert_topic_dossier|hook_prompt_submit|hook_post_connector|hook_turn_stop|list_auto_inbox|review_auto_inbox)$/;
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

  const { token, url } = readHookConfig();
  if (!token) {
    writeOut(noop);
    return process.exit(0);
  }

  const outbound = { ...payload };
  if (event === 'turn-stop' && (!outbound.last_assistant_message || (!outbound.prompt && !outbound.lastUserInput))) {
    const tail = extractTailFromTranscript(outbound.transcript_path || outbound.transcriptPath);
    if (!outbound.last_assistant_message && tail.lastAssistant) outbound.last_assistant_message = tail.lastAssistant;
    if (!outbound.prompt && !outbound.lastUserInput && tail.lastUser) outbound.prompt = tail.lastUser;
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
