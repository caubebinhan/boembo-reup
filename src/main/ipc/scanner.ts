import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-types'

export function setupScannerIPC() {
  ipcMain.handle(IPC_CHANNELS.SCANNER_OPEN_WINDOW, async (event) => {
    const parentWin = BrowserWindow.fromWebContents(event.sender)
    
    // Create popup scanner window
    const scannerWin = new BrowserWindow({
      parent: parentWin || undefined,
      modal: true,
      width: 1000,
      height: 700,
      title: 'REPOST.IO - Scan Content Source',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    })

    // Securely intercept repost:// navigation to send data back
    scannerWin.webContents.on('will-navigate', (e, url) => {
      if (url.startsWith('repost://import')) {
        e.preventDefault()
        try {
          // Parse the URL to get data safely
          const urlObj = new URL(url)
          const type = urlObj.searchParams.get('type')
          const name = urlObj.searchParams.get('name')
          
          if (type && name) {
            // Forward back to main application
            if (parentWin) {
              parentWin.webContents.send(IPC_CHANNELS.SCANNER_IMPORT, {
                type,
                name,
                url: urlObj.searchParams.get('url') || '',
                autoSchedule: true,
                historyLimit: 10,
                sortOrder: 'newest',
                timeRange: 'history_and_future'
              })
            }
            scannerWin.close()
          }
        } catch (err) {
          console.error('Error parsing scanner import URI', err)
        }
      }
    })

    // Inject our UI
    scannerWin.webContents.on('did-finish-load', () => {
      const script = `
        if (!document.getElementById('repost-scanner-overlay')) {
          const overlay = document.createElement('div');
          overlay.id = 'repost-scanner-overlay';
          // Styling...
          Object.assign(overlay.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '320px',
            backgroundColor: '#1e293b',
            border: '2px solid #8b5cf6',
            borderRadius: '12px',
            padding: '16px',
            color: 'white',
            zIndex: '999999',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          });

          overlay.innerHTML = \`
            <h3 style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold; color: white;">REPOST.IO Scanner</h3>
            <p style="margin: 0 0 15px 0; font-size: 12px; color: #cbd5e1;">Navigate to a profile or search results, then click below to import.</p>
            <button id="repost-import-btn" style="width: 100%; border: none; padding: 12px; background-color: #8b5cf6; color: white; border-radius: 8px; font-weight: bold; cursor: pointer; transition: background-color 0.2s;">
              + Import Target Source
            </button>
          \`;

          document.body.appendChild(overlay);

          const btn = document.getElementById('repost-import-btn');
          btn.addEventListener('mouseover', () => btn.style.backgroundColor = '#7c3aed');
          btn.addEventListener('mouseout', () => btn.style.backgroundColor = '#8b5cf6');
          
          btn.addEventListener('click', () => {
            const currentUrl = window.location.href;
            let type = 'keyword';
            let name = currentUrl;
            
            if (currentUrl.includes('tiktok.com/@')) {
              type = 'channel';
              const match = currentUrl.match(/@([a-zA-Z0-9_.-]+)/);
              if (match) {
                name = '@' + match[1];
              }
            } else if (currentUrl.includes('/search')) {
              type = 'keyword';
              const urlParams = new URLSearchParams(window.location.search);
              name = urlParams.get('q') || 'Search Query';
            }

            // Communicate back via navigation interception
            window.location.href = \`repost://import?type=\${encodeURIComponent(type)}&name=\${encodeURIComponent(name)}&url=\${encodeURIComponent(currentUrl)}\`;
          });
        }
      `;
      scannerWin.webContents.executeJavaScript(script).catch(console.error);
    });

    await scannerWin.loadURL('https://www.tiktok.com/')
  })
}
