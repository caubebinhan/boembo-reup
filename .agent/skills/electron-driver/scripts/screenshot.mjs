#!/usr/bin/env node
/**
 * Take a screenshot of the Electron renderer via CDP.
 * Usage: node screenshot.mjs [--port 9222] [--output screenshot.png]
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

const args = process.argv.slice(2);
const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : '9222';
const outputPath = args.includes('--output')
  ? args[args.indexOf('--output') + 1]
  : resolve(import.meta.dirname, '..', 'output', 'screenshot.png');

async function main() {
  let targets;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`);
    targets = await res.json();
  } catch {
    console.error(`❌ Cannot connect to CDP on port ${port}.`);
    process.exit(1);
  }

  const pages = targets.filter(t => t.type === 'page');
  if (pages.length === 0) {
    console.error('❌ No page targets found.');
    process.exit(1);
  }

  const target = pages[0];
  const wsUrl = target.webSocketDebuggerUrl;
  if (!wsUrl) {
    console.error('❌ No webSocketDebuggerUrl.');
    process.exit(1);
  }

  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Page.captureScreenshot',
      params: { format: 'png' }
    }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id === 1) {
      if (msg.error) {
        console.error('❌ Error:', JSON.stringify(msg.error));
        process.exit(1);
      }
      const buffer = Buffer.from(msg.result.data, 'base64');
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, buffer);
      console.log(`📸 Screenshot saved to: ${outputPath}`);
      ws.close();
      process.exit(0);
    }
  };

  ws.onerror = (err) => {
    console.error('❌ WebSocket error:', err.message);
    process.exit(1);
  };
}

main();
