#!/usr/bin/env node
/**
 * Evaluate a JavaScript expression in the Electron renderer context via CDP.
 * Usage: node evaluate.mjs "document.title"
 *        node evaluate.mjs "document.querySelectorAll('.error').length" --port 9222
 */

const args = process.argv.slice(2);
const expression = args.find(a => !a.startsWith('--'));
const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : '9222';
const targetIndex = args.includes('--target') ? parseInt(args[args.indexOf('--target') + 1]) : 0;

if (!expression) {
  console.error('Usage: node evaluate.mjs "<expression>" [--port 9222] [--target 0]');
  process.exit(1);
}

async function main() {
  // Get targets
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

  const target = pages[targetIndex] || pages[0];
  const wsUrl = target.webSocketDebuggerUrl;
  if (!wsUrl) {
    console.error('❌ No webSocketDebuggerUrl. Target may already be in use.');
    process.exit(1);
  }

  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression,
        returnByValue: true,
        awaitPromise: true,
      }
    }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id === 1) {
      if (msg.error) {
        console.error('❌ CDP Error:', JSON.stringify(msg.error, null, 2));
      } else if (msg.result.exceptionDetails) {
        console.error('💥 Exception:', msg.result.exceptionDetails.exception?.description || msg.result.exceptionDetails.text);
      } else {
        const result = msg.result.result;
        if (result.type === 'object' || result.type === 'string') {
          console.log(typeof result.value === 'string' ? result.value : JSON.stringify(result.value, null, 2));
        } else {
          console.log(result.value ?? result.description ?? '(undefined)');
        }
      }
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
