const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // Detached Window Management
  openDetachedWindow: (initialState) => ipcRenderer.invoke('open-detached-window', initialState),
  closeDetachedWindow: () => ipcRenderer.invoke('close-detached-window'),
  isDetachedOpen: () => ipcRenderer.invoke('is-detached-open'),

  // State Sync (Main -> Detached)
  sendStateToDetached: (state) => ipcRenderer.send('sync-state-to-detached', state),
  onStateUpdate: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('state-updated', handler);
    return () => ipcRenderer.removeListener('state-updated', handler);
  },

  // Action Sync (Detached -> Main)
  sendActionToMain: (action) => ipcRenderer.send('sync-action-to-main', action),
  onActionFromDetached: (callback) => {
    const handler = (event, action) => callback(action);
    ipcRenderer.on('action-from-detached', handler);
    return () => ipcRenderer.removeListener('action-from-detached', handler);
  },

  // Window Controls for Detached Window
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', flag),
  setWindowOpacity: (opacity) => ipcRenderer.invoke('set-window-opacity', opacity),
  minimizeWindow: () => ipcRenderer.send('minimize-detached'),
  closeWindow: () => ipcRenderer.send('close-detached'),

  // Server URL Configuration (Raspberry Pi)
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  setServerUrl: (url) => ipcRenderer.invoke('set-server-url', url),
});
