import { app, shell, BrowserWindow, ipcMain, desktopCapturer } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { UCIEngine } from './uci-engine'

let engine: UCIEngine | null = null;

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    }
  })

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
