const express = require('express');
const { execFile, exec } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'NadaKu Audio Server' });
});

// Debug: cek versi yt-dlp
app.get('/version', (req, res) => {
  exec('yt-dlp --version && which yt-dlp', (err, stdout, stderr) => {
    res.json({ 
      version: stdout.trim(), 
      error: err?.message,
      stderr: stderr?.trim()
    });
  });
});

// Debug: list format yang tersedia
app.get('/formats', (req, res) => {
  const videoId = req.query.v || 'dQw4w9WgXcQ';
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  exec(`yt-dlp --list-formats --no-warnings "${ytUrl}" 2>&1`, 
    { timeout: 30000 }, 
    (err, stdout) => {
      res.json({ output: stdout, error: err?.message });
    }
  );
});

// GET /stream?v=VIDEO_ID
app.get('/stream', (req, res) => {
  const videoId = req.query.v;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Pakai pip install yt-dlp terbaru langsung saat request
  // karena nixpacks mungkin install versi lama
  exec('pip install -q --upgrade yt-dlp 2>/dev/null || pip3 install -q --upgrade yt-dlp 2>/dev/null; python3 -m yt_dlp --version', 
    (updateErr, updateOut) => {
      console.log('yt-dlp via python:', updateOut?.trim(), updateErr?.message);
      
      // Coba pakai python3 -m yt_dlp (versi terbaru via pip)
      const args = [
        '-m', 'yt_dlp',
        '-f', 'bestaudio/best',
        '--get-url',
        '--no-playlist', 
        '--no-warnings',
        '--no-check-certificates',
        ytUrl
      ];

      execFile('python3', args, { timeout: 30000 }, (err, stdout, stderr) => {
        if (!err && stdout.trim().startsWith('http')) {
          const url = stdout.trim().split('\n')[0];
          console.log('python3 -m yt_dlp succeeded');
          return res.json({ url, videoId });
        }

        console.log('python3 -m yt_dlp failed:', err?.message, stderr);

        // Fallback: yt-dlp binary langsung
        execFile('yt-dlp', [
          '-f', 'bestaudio/best',
          '--get-url',
          '--no-playlist',
          '--no-warnings', 
          '--no-check-certificates',
          '--extractor-args', 'youtube:player_client=android',
          ytUrl
        ], { timeout: 30000 }, (err2, stdout2, stderr2) => {
          if (!err2 && stdout2.trim().startsWith('http')) {
            const url = stdout2.trim().split('\n')[0];
            return res.json({ url, videoId });
          }

          console.log('yt-dlp binary failed:', err2?.message, stderr2);
          res.status(500).json({ 
            error: 'Failed to get stream URL',
            detail: err2?.message || stderr2,
            ytdlp_output: stderr2?.slice(0, 500)
          });
        });
      });
    }
  );
});

app.listen(PORT, () => {
  console.log(`NadaKu server running on port ${PORT}`);
});
