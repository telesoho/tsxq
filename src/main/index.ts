import { app, shell, BrowserWindow, ipcMain, desktopCapturer } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { UCIEngine } from './uci-engine'

let engine: UCIEngine | null = null;

// Window state management
const getStatePath = () => join(app.getPath('userData'), 'window-state.json');

const loadState = () => {
  try {
    const path = getStatePath();
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      return data;
    }
  } catch (e) {
    console.error('Failed to load window state:', e);
  }
  return { width: 1000, height: 720 }; // Default compact size for board + panel
};

const saveState = (bounds: { width: number; height: number }) => {
  try {
    writeFileSync(getStatePath(), JSON.stringify(bounds));
  } catch (e) {
    console.error('Failed to save window state:', e);
  }
};

function createWindow(): void {
  const state = loadState();
  
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      webSecurity: false,
    }
  })

  let resizeTimeout: NodeJS.Timeout;
  mainWindow.on('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const { width, height } = mainWindow.getBounds();
      saveState({ width, height });
    }, 500);
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // IPC Handlers
  ipcMain.handle('engine:start', () => {
    if (engine) return true;
    
    // TODO: Make this path configurable or auto-detect
    // For dev: assume it's in resources/bin/pikafish.exe
    // For prod: process.resourcesPath
    const enginePath = is.dev 
      ? join(__dirname, '../../resources/bin/pikafish.exe') 
      : join(process.resourcesPath, 'bin/pikafish.exe');
      
    console.log('Starting engine at:', enginePath);
    
    try {
        engine = new UCIEngine(enginePath);
        
        engine.on('ready', () => mainWindow.webContents.send('engine:status', 'ready'));
        engine.on('info', (info) => mainWindow.webContents.send('engine:info', info));
        engine.on('bestmove', (move) => mainWindow.webContents.send('engine:bestmove', move));
        engine.on('error', (err) => mainWindow.webContents.send('engine:error', err.message));
        
        engine.start();
        return true;
    } catch (e: any) {
        console.error(e);
        return false;
    }
  });

  ipcMain.handle('engine:send', (_, command: string) => {
    if (engine) {
      engine.send(command);
    }
  });

  ipcMain.handle('vision:predict', async (_, imageBase64: string) => {
    try {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      
      const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="board.png"\r\nContent-Type: image/png\r\n\r\n`),
        buffer,
        Buffer.from(`\r\n--${boundary}--\r\n`)
      ]);

      const response = await fetch('http://localhost:8000/predict', {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: body as any
      });

      if (!response.ok) {
        let errorMsg = `API Error: ${response.status} ${response.statusText}`;
        try {
            const err = await response.json() as any;
            if (err.detail) errorMsg += ` - ${JSON.stringify(err.detail)}`;
        } catch (e) {}
        throw new Error(errorMsg);
      }
      
      return await response.json();
    } catch (e: any) {
      console.error('Vision API error:', e);
      throw new Error(e.message);
    }
  });

  ipcMain.handle('screen:getSources', async () => {
    try {
      const sources = await desktopCapturer.getSources({ 
        types: ['window', 'screen'], 
        thumbnailSize: { width: 300, height: 200 },
        fetchWindowIcons: true
      });
      console.log(`[screen:getSources] Found ${sources.length} sources`);
      return sources.map(s => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL()
      }));
    } catch (error) {
      console.error('[screen:getSources] Error:', error);
      return [];
    }
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
