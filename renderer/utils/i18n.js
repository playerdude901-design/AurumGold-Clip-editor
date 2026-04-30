/**
 * Lightweight i18n utility
 */
class I18n {
  constructor() {
    this.locale = 'en';
    this.translations = {};
  }

  async setLocale(locale) {
    this.locale = locale;
    try {
      const response = await fetch(`./locales/${locale}.json`);
      this.translations = await response.json();
      this.updateDOM();
      
      // Save setting
      if (window.electronAPI) {
        window.electronAPI.saveSettings({ language: locale });
      }
    } catch (e) {
      console.error('Failed to load locale:', locale, e);
    }
  }

  t(key) {
    return this.translations[key] || key;
  }

  updateDOM() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translation = this.t(key);
      
      if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'placeholder')) {
        el.placeholder = translation;
      } else if (el.hasAttribute('title')) {
        el.setAttribute('title', translation);
        if (el.innerText.trim() !== '') el.childNodes[el.childNodes.length - 1].textContent = translation;
      } else {
        // Handle cases where there's an SVG inside
        const svg = el.querySelector('svg');
        if (svg) {
          // Keep the SVG and update the text node
          const textNode = Array.from(el.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '');
          if (textNode) {
            textNode.textContent = ' ' + translation;
          } else {
            el.appendChild(document.createTextNode(' ' + translation));
          }
        } else {
          el.textContent = translation;
        }
      }
    });
  }
}

window.i18n = new I18n();
