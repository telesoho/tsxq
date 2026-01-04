import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  startEngine: () => ipcRenderer.invoke('engine:start'),
  sendToEngine: (command: string) => ipcRenderer.invoke('engine:send', command),
  onEngineInfo: (callback: (info: any) => void) => {
    const subscription = (_: any, info: any) => callback(info);
    ipcRenderer.on('engine:info', subscription);
    return () => ipcRenderer.removeListener('engine:info', subscription);
  },
  onBestMove: (callback: (move: string) => void) => {
    const subscription = (_: any, move: string) => callback(move);
    ipcRenderer.on('engine:bestmove', subscription);
    return () => ipcRenderer.removeListener('engine:bestmove', subscription);
  },
  onEngineStatus: (callback: (status: string) => void) => {
    const subscription = (_: any, status: string) => callback(status);
    ipcRenderer.on('engine:status', subscription);
    return () => ipcRenderer.removeListener('engine:status', subscription);
  },
  getScreenSources: () => ipcRenderer.invoke('screen:getSources'),
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
