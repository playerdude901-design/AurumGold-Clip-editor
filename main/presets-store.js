const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

class PresetsStore {
  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'presets.json');
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, '[]');
  }

  list() {
    try { return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')); }
    catch { return []; }
  }

  save(preset) {
    const presets = this.list().filter(p => p.name !== preset.name);
    presets.push({ ...preset, savedAt: Date.now() });
    fs.writeFileSync(this.filePath, JSON.stringify(presets, null, 2));
    return presets;
  }

  remove(name) {
    const presets = this.list().filter(p => p.name !== name);
    fs.writeFileSync(this.filePath, JSON.stringify(presets, null, 2));
    return presets;
  }
}

module.exports = PresetsStore;
