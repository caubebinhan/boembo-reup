---
name: electron-driver
description: Perform debugging sessions on the Electron app by attaching to it via Chrome DevTools Protocol (CDP). Use this skill when you need to inspect runtime errors, console output, DOM state, or debug crashes in the running Electron application.
---

# Electron Driver Skill

Debug and inspect the running Electron application by connecting to it via **Chrome DevTools Protocol (CDP)**.

## Prerequisites

The Electron app must be launched with remote debugging enabled on port **9222**.
This is already configured in `.vscode/launch.json` via `REMOTE_DEBUGGING_PORT: 9222`.

### Starting the app with debugging enabled

```bash
# Option 1: Use the VS Code debugger (F5) with "Debug Main Process" config
# Option 2: Manual launch with remote debugging
npx electron-vite dev -- --remote-debugging-port=9222
```

## How to Debug

### Step 1: Discover available debug targets

Run the discovery script to find all debuggable pages/targets:

```bash
node .agent/skills/electron-driver/scripts/discover.mjs
```

This returns a JSON list of available targets (pages, workers, etc.) with their `webSocketDebuggerUrl`.

### Step 2: Capture console logs and errors

Run the console capture script to attach to the renderer and stream all console output and uncaught errors:

```bash
node .agent/skills/electron-driver/scripts/console-capture.mjs
```

**Options:**
- `--duration <ms>` — How long to capture (default: 10000ms = 10 seconds)
- `--target <index>` — Which target to attach to if multiple are found (default: 0, the first page)

**Example:** Capture 30 seconds of logs:
```bash
node .agent/skills/electron-driver/scripts/console-capture.mjs --duration 30000
```

### Step 3: Evaluate expressions in the renderer

Run JavaScript expressions in the context of the renderer page:

```bash
node .agent/skills/electron-driver/scripts/evaluate.mjs "document.title"
node .agent/skills/electron-driver/scripts/evaluate.mjs "JSON.stringify(window.__STORE__.getState(), null, 2)"
```

### Step 4: Take a screenshot of the app

```bash
node .agent/skills/electron-driver/scripts/screenshot.mjs
```

The screenshot is saved to `.agent/skills/electron-driver/output/screenshot.png`.

## Typical Debugging Workflow

1. **Start the app** with remote debugging enabled
2. **Run `discover.mjs`** to verify the app is connectable
3. **Run `console-capture.mjs`** to see runtime errors
4. **Use `evaluate.mjs`** to inspect specific state or DOM
5. **Take screenshots** to verify visual state
6. Analyze the captured output to identify and fix the bug

## Output

All output is printed to stdout as structured JSON where applicable. Screenshots go to `.agent/skills/electron-driver/output/`.
