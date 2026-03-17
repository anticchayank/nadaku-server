const express = require('express');
const { execFile, exec } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Update yt-dlp on startup to ensure latest version
exec('yt-dlp -U', (err, stdout, stderr) => {
  if (err) console.log('yt-dlp update skipped:', err.message);
  else console.log('yt-dlp updated:', stdout.trim() || 'already latest');
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'NadaKu Audio Server' });
});

// GET /stream?v=VIDEO_ID
app.get('/stream', (req, res) => {
  const videoId = req.query.v;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Step 1: list available formats first
  execFile('yt-dlp', ['--list-formats', '--no-warnings', ytUrl], 
    { timeout: 20000 }, 
    (err, stdout, stderr) => {
      console.log('Available formats for', videoId, ':\n', stdout);
      
      // Step 2: try progressively simpler format selectors
      tryGetUrl(ytUrl, videoId, res);
    }
  );
});

function tryGetUrl(ytUrl, videoId, res) {
  // Try formats in order of preference
  const formatSelectors = [
    'bestaudio',
    'worstaudio',
    '140',   // m4a 128k (most common YouTube audio format)
    '251',   // webm opus
    '250',   // webm opus low
    '249',   // webm opus lowest
    'best[height<=360]',
    'best',
  ];

  let index = 0;

  function tryNext() {
    if (index >= formatSelectors.length) {
      // Last resort: no format flag at all
      const args = ['--get-url', '--no-playlist', '--no-warnings', ytUrl];
      execFile('yt-dlp', args, { timeout: 30000 }, (err, stdout) => {
        if (err || !stdout.trim()) {
          return res.status(500).json({ 
            error: 'All formats failed', 
            detail: err?.message 
          });
        }
        const url = stdout.trim().split('\n')[0];
        res.json({ url, videoId });
      });
      return;
    }

    const fmt = formatSelectors[index++];
    const args = ['-f', fmt, '--get-url', '--no-playlist', '--no-warnings', ytUrl];

    execFile('yt-dlp', args, { timeout: 20000 }, (err, stdout) => {
      if (err || !stdout.trim().startsWith('http')) {
        console.log(`Format ${fmt} failed, trying next...`);
        tryNext();
      } else {
        const url = stdout.trim().split('\n')[0];
        console.log(`Format ${fmt} succeeded for ${videoId}`);
        res.json({ url, videoId, format: fmt });
      }
    });
  }

  tryNext();
}

app.listen(PORT, () => {
  console.log(`NadaKu server running on port ${PORT}`);
});
