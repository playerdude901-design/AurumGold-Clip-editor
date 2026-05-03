const { net } = require('electron');
const fs = require('fs');
const path = require('path');

const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

function resolveBin(raw) {
  if (raw && typeof raw === 'object' && raw.path) raw = raw.path;
  if (typeof raw !== 'string') throw new Error('Could not resolve binary path');
  return raw.replace(/app\.asar([/\\])/g, 'app.asar.unpacked$1');
}

try {
  ffmpeg.setFfmpegPath(resolveBin(ffmpegStatic));
} catch (e) {
  console.error('Kick FFmpeg path resolution failed:', e.message);
}

class KickService {
  constructor() {
    this.apiUrl = 'https://kick.com/api/v2/clips/';
  }

  // ... (keep extractSlug and getClipInfo unchanged) ...
  extractSlug(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'kick.com' || u.hostname.includes('kick.com')) {
        const parts = u.pathname.split('/');
        if (u.pathname.includes('/clips/')) return parts[parts.indexOf('clips') + 1];
        if (u.pathname.includes('/video/')) return parts[parts.indexOf('video') + 1];
        if (parts.length === 2 && parts[1]) return parts[1];
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  async getClipInfo(slug) {
    return new Promise((resolve, reject) => {
      const request = net.request({
        method: 'GET',
        url: this.apiUrl + slug,
        useSessionCookies: true
      });

      request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
      request.setHeader('Accept', 'application/json, text/plain, */*');
      request.setHeader('Accept-Language', 'en-US,en;q=0.9');
      request.setHeader('Origin', 'https://kick.com');
      request.setHeader('Referer', 'https://kick.com/');

      request.on('response', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
               return reject(new Error(`Kick API returned ${res.statusCode}`));
            }
            let parsed = JSON.parse(data);
            
            let clipData = parsed;
            if (parsed.clip) clipData = parsed.clip;
            else if (parsed.data && parsed.data.clip) clipData = parsed.data.clip;
            
            const videoUrl = clipData.video_url || clipData.source_url || clipData.clip_url || clipData.url;
            
            if (!clipData || !videoUrl) {
              console.error('Kick response keys:', Object.keys(parsed), clipData ? Object.keys(clipData) : 'no clipData');
              return reject(new Error('No video URL found in kick response'));
            }

            resolve({
              title: clipData.title || 'Kick Clip',
              thumbnail: clipData.thumbnail_url || '',
              slug: clipData.slug || slug,
              qualities: [
                {
                  quality: 'Source',
                  sourceURL: videoUrl
                }
              ]
            });
          } catch (e) {
            reject(new Error('Failed to parse Kick response: ' + e.message));
          }
        });
      });
      request.on('error', reject);
      request.end();
    });
  }

  /**
   * Downloads a clip to a specific path
   */
  async downloadClip(url, destPath, onProgress) {
    // If it's an HLS stream (m3u8), we must use FFmpeg to download and mux to mp4
    if (url.includes('.m3u8')) {
      return new Promise((resolve, reject) => {
        const headers = 
          'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36\r\n' +
          'Origin: https://kick.com\r\n' +
          'Referer: https://kick.com/\r\n';

        ffmpeg(url)
          .inputOptions(['-headers', headers])
          .outputOptions([
            '-c copy', // direct stream copy, very fast
            '-bsf:a aac_adtstoasc' // needed for HLS to MP4 audio
          ])
          .output(destPath)
          .on('progress', (progress) => {
            // FFmpeg progress on m3u8 doesn't always have a valid percent, but we can try
            if (onProgress) {
               // Just send a pulse if percent is NaN
               onProgress(progress.percent ? Math.min(99, Math.round(progress.percent)) : 50);
            }
          })
          .on('end', () => {
            if (onProgress) onProgress(100);
            resolve(destPath);
          })
          .on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(new Error(`FFmpeg HLS download failed: ${err.message}`));
          })
          .run();
      });
    }

    // Standard download for direct MP4 links
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      
      const request = net.request({
        method: 'GET',
        url: url,
        useSessionCookies: true
      });

      request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
      request.setHeader('Accept', '*/*');
      request.setHeader('Accept-Language', 'en-US,en;q=0.9');
      request.setHeader('Origin', 'https://kick.com');
      request.setHeader('Referer', 'https://kick.com/');
      
      request.on('response', (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download Kick clip: ${res.statusCode}`));
        }

        const contentLength = res.headers['content-length'];
        const totalSize = contentLength ? parseInt(Array.isArray(contentLength) ? contentLength[0] : contentLength, 10) : 0;
        let downloaded = 0;

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (onProgress && totalSize) {
            onProgress(Math.round((downloaded / totalSize) * 100));
          }
        });

        res.pipe(file);

        file.on('finish', () => {
          file.close();
        });

        file.on('close', () => {
          resolve(destPath);
        });
      });

      request.on('error', (err) => {
        fs.unlink(destPath, () => {}); // Delete partial file
        reject(err);
      });

      request.end();
    });
  }
}

module.exports = KickService;
