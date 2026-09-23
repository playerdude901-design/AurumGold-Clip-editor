/**
 * ThemeManager — 5 built-in themes with persistence.
 *
 * Themes:
 *  - aurum   "Aurum Gold"    (default, classic gold)
 *  - crimson "Crimson Pulse" (bg #1b1b1b, accent #FF1448)
 *  - abyss   "Abyss Blue"
 *  - emerald "Emerald Luxe"
 *  - royal   "Royal Violet"
 */
class ThemeManager {
  static THEMES = {
    aurum:   { name: 'Aurum Gold' },
    crimson: { name: 'Crimson Pulse' },
    abyss:   { name: 'Abyss Blue' },
    emerald: { name: 'Emerald Luxe' },
    royal:   { name: 'Royal Violet' }
  };

  static DEFAULT = 'aurum';
  static STORAGE_KEY = 'aurumgold-theme';

  constructor() {
    this.current = ThemeManager.DEFAULT;
    this.elName = document.getElementById('theme-name');
    this.elDots = Array.from(document.querySelectorAll('.theme-dot'));
    this._bindEvents();
  }

  async init(savedTheme) {
    const initial = savedTheme || localStorage.getItem(ThemeManager.STORAGE_KEY) || ThemeManager.DEFAULT;
    this.apply(initial, false);
  }

  _bindEvents() {
    this.elDots.forEach(btn => {
      btn.addEventListener('click', () => this.set(btn.dataset.themeDot));
    });
  }

  apply(theme, persist = true) {
    if (!ThemeManager.THEMES[theme]) theme = ThemeManager.DEFAULT;
    this.current = theme;
    document.documentElement.setAttribute('data-theme', theme);
    if (this.elName) this.elName.textContent = ThemeManager.THEMES[theme].name;
    this.elDots.forEach(b => b.classList.toggle('active', b.dataset.themeDot === theme));
    try {
      localStorage.setItem(ThemeManager.STORAGE_KEY, theme);
    } catch (_) { /* storage unavailable */ }
    if (persist && window.electronAPI) {
      window.electronAPI.saveSettings({ theme }).catch(() => {});
    }
  }

  set(theme) {
    this.apply(theme, true);
  }

  get() {
    return this.current;
  }
}
