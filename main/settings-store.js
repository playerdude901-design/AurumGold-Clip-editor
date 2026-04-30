const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class SettingsStore {
  constructor() {
    this.userDataPath = app.getPath('userData');
    this.settingsPath = path.join(this.userDataPath, 'settings.json');
    this.sessionPath  = path.join(this.userDataPath, 'last-session.json');

    if (!fs.existsSync(this.settingsPath)) {
      fs.writeFileSync(this.settingsPath, JSON.stringify({ language: 'en' }, null, 2));
    }
  }

  getSettings() {
    try {
      return JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'));
    } catch {
      return { language: 'en' };
    }
  }

  saveSettings(settings) {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    fs.writeFileSync(this.settingsPath, JSON.stringify(updated, null, 2));
    return updated;
  }

  getSession() {
    try {
      if (!fs.existsSync(this.sessionPath)) return null;
      return JSON.parse(fs.readFileSync(this.sessionPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  saveSession(session) {
    fs.writeFileSync(this.sessionPath, JSON.stringify(session, null, 2));
  }

  clearSession() {
    if (fs.existsSync(this.sessionPath)) fs.unlinkSync(this.sessionPath);
  }
}

module.exports = SettingsStore;
