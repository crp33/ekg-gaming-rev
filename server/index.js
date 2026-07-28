require('dotenv').config();

const path = require('path');
const express = require('express');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Simple health check — useful for confirming the server is alive locally
// and for Railway's deploy health checks.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Feature routes (Playwright scraping, Claude API, Supabase, Excel export)
// get mounted here as each module is built out. See server/modules/ for
// the current stubs.

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
