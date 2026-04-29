const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Video
  openVideo: (path) => ipcRenderer.invoke('video:open', path),

  // Export
  exportVideo: (params) => ipcRenderer.invoke('export:start', params),
  cancelExport: () => ipcRenderer.send('export:cancel'),
  onExportProgress: (cb) => ipcRenderer.on('export:progress', (_, d) => cb(d)),
  onExportDone:     (cb) => ipcRenderer.on('export:done',     (_, d) => cb(d)),
  onExportError:    (cb) => ipcRenderer.on('export:error',    (_, d) => cb(d)),
  removeExportListeners: () => {
    ipcRenderer.removeAllListeners('export:progress');
    ipcRenderer.removeAllListeners('export:done');
    ipcRenderer.removeAllListeners('export:error');
  },

  // Presets
  listPresets:  ()           => ipcRenderer.invoke('presets:list'),
  savePreset:   (preset)     => ipcRenderer.invoke('presets:save',   preset),
  deletePreset: (name)       => ipcRenderer.invoke('presets:delete', name),

  // Utilities
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  openFolder:   (p) => ipcRenderer.invoke('shell:openFolder', p),
  getVersion:   () => ipcRenderer.invoke('app:version')
});
