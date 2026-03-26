const { app, BrowserWindow, shell, Menu, Tray, nativeImage } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');

let mainWindow = null;
let nextProcess = null;
let tray = null;

const PORT = 3003;
const isDev = process.env.NODE_ENV === 'development';

// Enforce single instance — if another instance is already running, focus it
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function getIcon() {
  // Use a simple built-in icon for now
  // TODO: Replace with actual app icon
  const iconPath = path.join(__dirname, 'icon.png');
  try {
    return nativeImage.createFromPath(iconPath);
  } catch {
    return nativeImage.createEmpty();
  }
}

function waitForServer(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function check() {
      http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          resolve();
        } else {
          retry();
        }
      }).on('error', retry);
    }

    function retry() {
      if (Date.now() - start > timeout) {
        reject(new Error('Server startup timed out'));
        return;
      }
      setTimeout(check, 500);
    }

    check();
  });
}

function startNextServer() {
  return new Promise((resolve, reject) => {
    const isPackaged = app.isPackaged;
    const appPath = isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked')
      : path.join(__dirname, '..');

    if (isPackaged) {
      // Production: use Next.js standalone server.js via system node
      const standaloneDir = path.join(process.resourcesPath, 'standalone');
      const serverJs = path.join(standaloneDir, 'server.js');

      // Use Electron's bundled Node.js rather than requiring system node
      const electronExe = process.execPath;
      // Store config in user's app data directory (writable, persists across updates)
      const userDataDir = app.getPath('userData');
      nextProcess = spawn(electronExe, ['--no-warnings', serverJs], {
        cwd: standaloneDir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: String(PORT),
          HOSTNAME: 'localhost',
          ELECTRON_RUN_AS_NODE: '1',
          COUNCIL_CONFIG_DIR: userDataDir,
        },
        stdio: 'pipe',
      });
    } else {
      // Dev: run "next dev" via the CLI
      const cmd = process.platform === 'win32'
        ? `"${path.join(appPath, 'node_modules', '.bin', 'next.cmd')}" dev -p ${PORT}`
        : path.join(appPath, 'node_modules', '.bin', 'next');
      const args = process.platform === 'win32' ? [] : ['dev', '-p', String(PORT)];
      nextProcess = spawn(cmd, args, {
        cwd: appPath,
        env: { ...process.env, PORT: String(PORT) },
        stdio: 'pipe',
        shell: process.platform === 'win32',
      });
    }

    nextProcess.stdout?.on('data', (data) => {
      console.log(`[next] ${data.toString().trim()}`);
    });

    nextProcess.stderr?.on('data', (data) => {
      console.error(`[next] ${data.toString().trim()}`);
    });

    nextProcess.on('error', (err) => {
      console.error('Failed to start Next.js server:', err);
      reject(err);
    });

    nextProcess.on('exit', (code) => {
      console.log(`Next.js server exited with code ${code}`);
      nextProcess = null;

      // If server crashes after window is open, show error dialog
      if (mainWindow && code !== 0 && code !== null) {
        const { dialog } = require('electron');
        dialog.showMessageBoxSync(mainWindow, {
          type: 'error',
          title: 'Server Stopped',
          message: 'The Agent Council server stopped unexpectedly.',
          buttons: ['Quit'],
        });
        app.quit();
      }
    });

    // Wait for the server to be ready
    waitForServer(`http://localhost:${PORT}`)
      .then(resolve)
      .catch(reject);
  });
}

async function getStartPage() {
  // Check if any project is connected — if so, go straight to meetings
  try {
    const res = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${PORT}/api/projects`, (r) => {
        let data = '';
        r.on('data', (chunk) => { data += chunk; });
        r.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });
    if (res.projects && res.projects.length > 0) return '/meetings';
  } catch {}
  return '/setup';
}

function createWindow(startPage = '/meetings') {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Agent Council',
    backgroundColor: '#0a0a0a',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Show window when content is ready (avoids white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadURL(`http://localhost:${PORT}${startPage}`);

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://localhost:${PORT}`)) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Remove default menu bar for cleaner look
  if (!isDev) {
    Menu.setApplicationMenu(null);
  }
}

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { background: transparent; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #141416;
          color: #fff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          border-radius: 12px;
          overflow: hidden;
          -webkit-app-region: drag;
        }
        .title {
          font-size: 24px;
          font-weight: 700;
          letter-spacing: -0.5px;
          margin-bottom: 8px;
        }
        .dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #a78bfa;
          margin-right: 8px;
          vertical-align: middle;
        }
        .status {
          font-size: 13px;
          color: #888;
          margin-top: 16px;
        }
        .spinner {
          width: 24px;
          height: 24px;
          border: 2px solid #333;
          border-top-color: #a78bfa;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-top: 20px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div class="title"><span class="dot"></span>Agent Council</div>
      <div class="spinner"></div>
      <div class="status">Starting server...</div>
    </body>
    </html>
  `)}`);

  return splash;
}

app.whenReady().then(async () => {
  const splash = createSplashWindow();

  try {
    await startNextServer();
    const startPage = await getStartPage();
    splash.close();
    createWindow(startPage);
  } catch (err) {
    console.error('Failed to start:', err);
    splash.close();
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (nextProcess) {
    // Kill the Next.js server process tree synchronously to prevent orphans
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${nextProcess.pid} /f /t`, { stdio: 'ignore' });
      } else {
        nextProcess.kill('SIGKILL');
      }
    } catch {
      // Process may have already exited
    }
    nextProcess = null;
  }
});
