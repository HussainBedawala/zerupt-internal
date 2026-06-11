/**
 * Stdio smoke test: spawns the MCP server and calls tools/list + curated marketing tools via JSON-RPC over stdio.
 * Run: node smoke-test.mjs
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entryPoint = join(__dirname, 'dist', 'index.js');

const LOCAL_CONTENT_ROOT = '/Users/hus3ain/Development/Zerupt';

const proc = spawn('node', [entryPoint], {
  env: {
    ...process.env,
    MCP_TRANSPORT: 'stdio',
    LOCAL_CONTENT_ROOT,
  },
  stdio: ['pipe', 'pipe', 'inherit'],
});

const rl = createInterface({ input: proc.stdout });
const pending = new Map();
let nextId = 1;

function send(msg) {
  const line = JSON.stringify(msg) + '\n';
  proc.stdin.write(line);
}

function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    send({ jsonrpc: '2.0', id, method, params });
  });
}

rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // ignore non-JSON lines
  }
  if (msg.id != null && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});

async function run() {
  // 1. Initialize
  await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke-test', version: '0.0.1' },
  });
  send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

  console.log('✓ Initialized');

  // 2. tools/list
  const toolsResult = await request('tools/list', {});
  const tools = toolsResult.tools ?? [];
  console.log(`✓ tools/list: ${tools.length} tools`);
  for (const t of tools) {
    console.log(`  - ${t.name}`);
  }

  // 3. Call get_brand (curated marketing tool)
  const brandResult = await request('tools/call', {
    name: 'get_brand',
    arguments: { section: 'foundation' },
  });
  const content = brandResult.content?.[0]?.text ?? '';
  if (content.length > 0) {
    console.log(`✓ get_brand(foundation): ${content.slice(0, 80)}...`);
  } else {
    console.log('✗ get_brand returned empty content');
    process.exit(1);
  }

  // 4. Call list_features (the canonical feature catalog)
  const listResult = await request('tools/call', {
    name: 'list_features',
    arguments: {},
  });
  const listText = listResult.content?.[0]?.text ?? '';
  if (!listText.length) {
    console.log('✗ list_features returned empty content');
    process.exit(1);
  }
  console.log(`✓ list_features: ${listText.slice(0, 100)}...`);

  // Done
  console.log('\n✓ Smoke test passed.');
  proc.kill('SIGKILL');
  process.exit(0);
}

run().catch((err) => {
  console.error('✗ Smoke test failed:', err.message);
  proc.kill();
  process.exit(1);
});

setTimeout(() => {
  console.error('✗ Smoke test timed out');
  proc.kill();
  process.exit(1);
}, 15000);
