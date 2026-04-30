/**
 * Twitch Modal component
 */
class TwitchModal {
  constructor(state) {
    this.state = state;
    this.downloadFolder = null;
    this.clipInfo = null;
    this.downloading = false;

    // Elements
    this.elOverlay = document.getElementById('twitch-overlay');
    this.elBtnTwitch = document.getElementById('btn-twitch');
    this.elClose = document.getElementById('twitch-close');
    
    this.elUrlInput = document.getElementById('twitch-url-input');
    this.elBtnFetch = document.getElementById('btn-twitch-fetch');
    
    this.elInfoSection = document.getElementById('twitch-info-section');
    this.elThumb = document.getElementById('twitch-thumb');
    this.elTitle = document.getElementById('twitch-title');
    this.elCreator = document.getElementById('twitch-creator');
    
    this.elQualitySelect = document.getElementById('twitch-quality-select');
    this.elFolderPath = document.getElementById('twitch-folder-path');
    this.elBtnSelectFolder = document.getElementById('btn-twitch-select-folder');
    
    this.elProgressWrap = document.getElementById('twitch-progress-wrap');
    this.elProgressFill = document.getElementById('twitch-progress-fill');
    this.elProgressPct = document.getElementById('twitch-progress-pct');
    
    this.elBtnDownload = document.getElementById('btn-twitch-download');

    this._bindEvents();
  }

  open() {
    this._reset();
    this.elOverlay.style.display = 'flex';
  }

  close() {
    if (this.downloading) return;
    this.elOverlay.style.display = 'none';
  }

  _reset() {
    this.elUrlInput.value = '';
    this.elInfoSection.style.display = 'none';
    this.elProgressWrap.style.display = 'none';
    this.elBtnDownload.disabled = true;
    this.elProgressFill.style.width = '0%';
    this.elProgressPct.textContent = '0%';
    this.clipInfo = null;
    this.downloading = false;
  }

  async _fetchInfo() {
    const url = this.elUrlInput.value.trim();
    if (!url) return;

    this.elBtnFetch.disabled = true;
    this.elBtnFetch.textContent = 'Fetching...';

    try {
      const info = await window.electronAPI.twitchGetInfo(url);
      this.clipInfo = info;
      
      this.elThumb.src = info.thumbnail;
      this.elTitle.textContent = info.title;
      this.elCreator.textContent = `Clip: ${info.slug}`;
      
      // Populate qualities
      this.elQualitySelect.innerHTML = info.qualities.map(q => 
        `<option value="${q.sourceURL}">${q.quality} (${q.frameRate || '?'} fps)</option>`
      ).join('');
      
      this.elInfoSection.style.display = 'block';
      this.elBtnDownload.disabled = !this.downloadFolder;
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      this.elBtnFetch.disabled = false;
      this.elBtnFetch.textContent = 'Fetch Info';
    }
  }

  async _startDownload() {
    if (!this.clipInfo || !this.downloadFolder) return;

    const selectedUrl = this.elQualitySelect.value;
    const filename = `Twitch_${this.clipInfo.slug}_${Date.now()}.mp4`;
    
    this.downloading = true;
    this.elBtnDownload.disabled = true;
    this.elProgressWrap.style.display = 'flex';

    window.electronAPI.onTwitchProgress(({ percent }) => {
      this.elProgressFill.style.width = `${percent}%`;
      this.elProgressPct.textContent = `${percent}%`;
    });

    try {
      const downloadedPath = await window.electronAPI.twitchDownload({
        url: selectedUrl,
        folder: this.downloadFolder,
        filename
      });

      this.downloading = false;
      this.close();
      
      // Notify app to load the new video
      EventBus.emit('twitch:download-complete', downloadedPath);
      
    } catch (err) {
      alert(`Download failed: ${err.message}`);
      this.downloading = false;
      this.elBtnDownload.disabled = false;
      this.elProgressWrap.style.display = 'none';
    }
  }

  _bindEvents() {
    this.elBtnTwitch.addEventListener('click', () => this.open());
    this.elClose.addEventListener('click', () => this.close());
    this.elOverlay.addEventListener('click', (e) => { if (e.target === this.elOverlay) this.close(); });
    
    this.elBtnFetch.addEventListener('click', () => this._fetchInfo());
    this.elUrlInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') this._fetchInfo(); });
    
    this.elBtnSelectFolder.addEventListener('click', async () => {
      const folder = await window.electronAPI.selectFolder();
      if (folder) {
        this.downloadFolder = folder;
        this.elFolderPath.textContent = folder;
        if (this.clipInfo) this.elBtnDownload.disabled = false;
      }
    });
    
    this.elBtnDownload.addEventListener('click', () => this._startDownload());
  }
}
