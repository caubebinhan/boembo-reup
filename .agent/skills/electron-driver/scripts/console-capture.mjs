#!/usr/bin/env node
/**
 * Attach to the Electron renderer via CDP and capture console logs + uncaught errors.
 * Usage: node console-capture.mjs [--duration 10000] [--target 0] [--port 9222]
 */

import { createConnection } from 'net';

// Parse args
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : defaultValue;
}

const port = getArg('port', '9222');
const duration = parseInt(getArg('duration', '10000'), 10);
const targetIndex = parseInt(getArg('target', '0'), 10);

async function getTargets() {
  const res = await fetch(`http://127.0.0.1:${port}/json`);
  return res.json();
}

async function connectCDP(wsUrl) {
  const url = new URL(wsUrl);
  
  return new Promise((resolve, reject) => {
    // Use native WebSocket (available in Node 22+)
    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    const pending = new Map();

    ws.onopen = () => {
      const api = {
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const id = msgId++;
            pending.set(id, { resolve: res, reject: rej });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        onEvent: null,
        close: () => ws.close(),
      };
      resolve(api);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? p.reject(msg.error) : p.resolve(msg.result);
      } else if (msg.method && ws._api?.onEvent) {
        ws._api.onEvent(msg.method, msg.params);
      }
    };

    ws.onerror = (err) => reject(err);
    ws.onclose = () => {};

    // Store api ref for event handler
    ws.addEventListener('open', () => { ws._api = ws.__api; });
  });
}

async function main() {
  console.log(`🔍 Discovering targets on port ${port}...`);
  
  let targets;
  try {
    targets = await getTargets();
  } catch {
    console.error(`❌ Cannot connect to CDP on port ${port}. Is the app running with --remote-debugging-port=${port}?`);
    process.exit(1);
  }

  const pages = targets.filter(t => t.type === 'page');
  if (pages.length === 0) {
    console.error('❌ No page targets found.');
    process.exit(1);
  }

  const target = pages[targetIndex] || pages[0];
  console.log(`📎 Attaching to: ${target.title} (${target.url})`);

  const wsUrl = target.webSocketDebuggerUrl;
  if (!wsUrl) {
    console.error('❌ No webSocketDebuggerUrl available. Target might already be attached.');
    process.exit(1);
  }

  const ws = new WebSocket(wsUrl);
  let msgId = 1;

  const logs = [];

  ws.onopen = async () => {
    console.log(`✅ Connected! Capturing for ${duration / 1000}s...\n`);

    // Enable Console and Runtime domains
    ws.send(JSON.stringify({ id: msgId++, method: 'Console.enable' }));
    ws.send(JSON.stringify({ id: msgId++, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: msgId++, method: 'Log.enable' }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.method === 'Runtime.consoleAPICalled') {
      const { type, args: callArgs, timestamp } = msg.params;
      const text = callArgs.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
      const entry = { type, text, timestamp };
      logs.push(entry);
      
      const icon = type === 'error' ? '🔴' : type === 'warning' ? '🟡' : type === 'info' ? '🔵' : '⚪';
      console.log(`${icon} [${type.toUpperCase()}] ${text}`);
    }

    if (msg.method === 'Runtime.exceptionThrown') {
      const { exceptionDetails } = msg.params;
      const text = exceptionDetails.exception?.description || exceptionDetails.text || 'Unknown error';
      const entry = { type: 'exception', text, lineNumber: exceptionDetails.lineNumber, columnNumber: exceptionDetails.columnNumber };
      logs.push(entry);
      console.log(`💥 [EXCEPTION] ${text}`);
    }

    if (msg.method === 'Log.entryAdded') {
      const { entry } = msg.params;
      const logEntry = { type: entry.level, text: entry.text, source: entry.source, url: entry.url };
      logs.push(logEntry);
      console.log(`📋 [${entry.level.toUpperCase()}] [${entry.source}] ${entry.text}`);
    }
  };

  ws.onerror = (err) => {
    console.error('❌ WebSocket error:', err.message);
  };

  // Stop after duration
  setTimeout(() => {
    console.log(`\n📊 Capture complete. ${logs.length} entries collected.`);
    console.log('\n--- SUMMARY ---');
    
    const errors = logs.filter(l => l.type === 'error' || l.type === 'exception');
    const warnings = logs.filter(l => l.type === 'warning');
    
    console.log(`  Errors:   ${errors.length}`);
    console.log(`  Warnings: ${warnings.length}`);
    console.log(`  Other:    ${logs.length - errors.length - warnings.length}`);
    
    if (errors.length > 0) {
      console.log('\n🔴 ERRORS:');
      errors.forEach((e, i) => console.log(`  ${i + 1}. ${e.text}`));
    }
    if (warnings.length > 0) {
      console.log('\n🟡 WARNINGS:');
      warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w.text}`));
    }
    
    ws.close();
    process.exit(0);
  }, duration);
}

main();
