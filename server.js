const express = require('express');
const { execFile } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'NadaKu Audio Server' });
});

// GET /stream?v=VIDEO_ID
// Returns the best audio stream URL for a YouTube video
app.get('/stream', (req, res) => {
  const videoId = req.query.v;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // yt-dlp args:
  // -f bestaudio[ext=m4a]/bestaudio  → prefer m4a audio (plays natively on Android)
  // --get-url                         → print direct URL only
  // --no-playlist                     → single video only
  // --extractor-args youtube:skip=dash,hls  → use standard streams
  const args = [
    '-f', 'bestaudio/best',
    '--get-url',
    '--no-playlist',
    '--no-warnings',
    ytUrl
  ];

  execFile('yt-dlp', args, { timeout: 20000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('yt-dlp error:', err.message, stderr);
      return res.status(500).json({
        error: 'Failed to get stream URL',
        detail: err.message
      });
    }

    const url = stdout.trim().split('\n')[0];
    if (!url || !url.startsWith('http')) {
      return res.status(500).json({ error: 'No valid URL returned', raw: stdout });
    }

    res.json({ url, videoId });
  });
});

// GET /info?v=VIDEO_ID
// Returns video title, duration, thumbnail
app.get('/info', (req, res) => {
  const videoId = req.query.v;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    ytUrl
  ];

  execFile('yt-dlp', args, { timeout: 20000 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    try {
      const info = JSON.parse(stdout);
      res.json({
        videoId,
        title: info.title,
        duration: info.duration,
        thumbnail: info.thumbnail,
        channel: info.channel
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse info', raw: stdout.slice(0, 500) });
    }
  });
});

app.listen(PORT, () => {
  console.log(`NadaKu server running on port ${PORT}`);
});
