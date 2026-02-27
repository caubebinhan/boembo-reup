#!/usr/bin/env node
/**
 * Discover available CDP targets from the running Electron app.
 * Usage: node discover.mjs [--port 9222]
 */

const port = process.argv.includes('--port')
  ? process.argv[process.argv.indexOf('--port') + 1]
  : '9222';

const url = `http://127.0.0.1:${port}/json`;

try {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const targets = await res.json();

  console.log(JSON.stringify(targets, null, 2));
  console.log(`\n✅ Found ${targets.length} target(s) on port ${port}`);
} catch (err) {
  console.error(`❌ Cannot connect to CDP on port ${port}.`);
  console.error(`   Make sure the Electron app is running with --remote-debugging-port=${port}`);
  console.error(`   Error: ${err.message}`);
  process.exit(1);
}
