/**
 * Wizard IPC — Session management only
 * Video editor handlers → ipc/video-editor.ts
 * Account handlers → ipc/accounts.ts
 */
export function setupWizardIPC() {
  // Wizard session handlers are registered by workflow auto-discovery
  // (src/workflows/*/v*/ipc.ts). This file is kept as a named export
  // so main/index.ts can call it without breaking the setup chain.
  // Currently no wizard-specific IPC lives here
  // — everything is handled by the per-workflow ipc barrel.
}
