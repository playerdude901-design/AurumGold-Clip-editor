const https = require('https');
const fs = require('fs');
const path = require('path');

class TwitchService {
  constructor() {
    this.clientId = 'ue6666qo983tsx6so1t0vnawi233wa';
    this.gqlUrl = 'https://gql.twitch.tv/gql';
  }

  /**
   * Extracts slug from Twitch clip URL
   */
  extractSlug(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'clips.twitch.tv') {
        return u.pathname.substring(1);
      }
      if (u.hostname.includes('twitch.tv') && u.pathname.includes('/clip/')) {
        const parts = u.pathname.split('/');
        const clipIdx = parts.indexOf('clip');
        return parts[clipIdx + 1];
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  /**
   * Fetches available qualities and metadata for a clip
   */
  async getClipInfo(slug) {
    const query = [
      {
        operationName: 'ShareClipRenderStatus',
        variables: { slug },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: '0a02bb974443b576f5579aab0fef1d4b7f44e58a8a256f0c5adfead0db70640f'
          }
        }
      }
    ];

    return new Promise((resolve, reject) => {
      const req = https.request(this.gqlUrl, {
        method: 'POST',
        headers: {
          'Client-Id': this.clientId,
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const clip = json[0]?.data?.clip;
            if (!clip) return reject(new Error('Clip not found or hash expired'));

            const sig = clip.playbackAccessToken?.signature;
            const token = clip.playbackAccessToken?.value;
            
            // Qualities are now nested in assets -> LANDSCAPE
            const landscapeAsset = clip.assets?.find(a => a.id.includes('LANDSCAPE')) || clip.assets?.[0];
            const videoQualities = landscapeAsset?.videoQualities || [];
            
            const qualities = videoQualities.map((q, i) => {
              const fps = Math.round(q.frameRate);
              let qLabel = `${q.quality}p`;
              if (i === 0) qLabel = `Source (${qLabel})`;
              
              return {
                quality: qLabel,
                frameRate: fps,
                sourceURL: `${q.sourceURL}?sig=${sig}&token=${encodeURIComponent(token)}`
              };
            });

            if (qualities.length === 0) {
              return reject(new Error('No video qualities found for this clip'));
            }

            resolve({
              title: clip.title,
              thumbnail: clip.thumbnailURL,
              slug: clip.slug,
              qualities: qualities
            });
          } catch (e) {
            reject(new Error('Failed to parse Twitch response: ' + e.message));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(query));
      req.end();
    });
  }

  /**
   * Downloads a clip to a specific path
   */
  async downloadClip(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      
      https.get(url, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download: ${res.statusCode}`));
        }

        const totalSize = parseInt(res.headers['content-length'], 10);
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
          resolve(destPath);
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {}); // Delete partial file
        reject(err);
      });
    });
  }
}

module.exports = TwitchService;
