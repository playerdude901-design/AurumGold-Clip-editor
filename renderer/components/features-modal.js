/**
 * Features Modal component
 * Displays what's new in the current version.
 */
class FeaturesModal {
  constructor() {
    this.currentVersion = '1.0.7';
    this.elOverlay = document.getElementById('features-overlay');
    this.elCloseBtn = document.getElementById('features-close');
    this.elGotItBtn = document.getElementById('btn-features-close');
    this.elDate = document.getElementById('version-date');

    // Set current date
    const now = new Date();
    const options = { month: 'long', year: 'numeric' };
    if (this.elDate) {
      this.elDate.textContent = now.toLocaleDateString(undefined, options);
    }

    this._bindEvents();
  }

  async checkAndShow() {
    // Show once per session per version
    const shownThisSession = sessionStorage.getItem(`aurum_features_shown_${this.currentVersion}`);
    
    if (!shownThisSession) {
      this.open();
      sessionStorage.setItem(`aurum_features_shown_${this.currentVersion}`, 'true');
    }
  }

  open() {
    if (this.elOverlay) {
      this.elOverlay.style.display = 'flex';
    }
  }

  close() {
    if (this.elOverlay) {
      this.elOverlay.style.display = 'none';
    }
  }

  _bindEvents() {
    if (this.elCloseBtn) {
      this.elCloseBtn.addEventListener('click', () => this.close());
    }
    if (this.elGotItBtn) {
      this.elGotItBtn.addEventListener('click', () => this.close());
    }
    if (this.elOverlay) {
      this.elOverlay.addEventListener('click', (e) => {
        if (e.target === this.elOverlay) this.close();
      });
    }
  }
}
