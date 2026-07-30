const fileInput = document.getElementById('file-input');
const uploadBox = document.getElementById('upload-box');
const uploadFilename = document.getElementById('upload-filename');
const processButton = document.getElementById('process-button');
const statusMessage = document.getElementById('status-message');
const resultsSection = document.getElementById('results-section');
const flaggedSummary = document.getElementById('flagged-summary');
const tableHead = document.querySelector('#results-table thead');
const tableBody = document.querySelector('#results-table tbody');
const narrativeBody = document.getElementById('narrative-body');
const downloadButton = document.getElementById('download-button');
const tabUpload = document.getElementById('tab-upload');
const tabUrl = document.getElementById('tab-url');
const panelUpload = document.getElementById('panel-upload');
const panelUrl = document.getElementById('panel-url');
const urlInput = document.getElementById('url-input');

// Column metadata is fetched from /api/schema (server/config/ekg-schema.js)
// rather than duplicated here, so this file never drifts from the schema.
let schemaColumns = [];
let selectedFile = null;
let currentRows = null;
let inputMode = 'upload'; // 'upload' | 'url' — which panel/tab is active

async function loadSchema() {
  if (schemaColumns.length) return; // already loaded — safe to call more than once
  const res = await fetch('/api/schema', { headers: window.EKGAuth.authHeaders() });
  const data = await res.json();
  schemaColumns = data.columns;
  buildTableHead();
}

// public/auth.js dispatches this once the tool becomes visible — either
// immediately (Supabase not configured) or right after sign-in. Loading the
// schema only at that point (rather than unconditionally on script load)
// avoids an unauthenticated /api/schema call racing ahead of login when
// auth is required.
window.addEventListener('ekg:tool-ready', loadSchema);

function buildTableHead() {
  const headRow = document.createElement('tr');
  for (const col of schemaColumns) {
    const th = document.createElement('th');
    th.textContent = col.header;
    if (col.description) th.title = col.description;
    headRow.appendChild(th);
  }
  tableHead.innerHTML = '';
  tableHead.appendChild(headRow);
}

function setStatus(message, kind) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message status-${kind || 'info'}`;
}

function setSelectedFile(file) {
  selectedFile = file;
  uploadFilename.textContent = file ? file.name : '';
  uploadBox.classList.toggle('has-file', Boolean(file));
  updateProcessButtonState();
}

function looksLikeUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function updateProcessButtonState() {
  processButton.disabled =
    inputMode === 'upload' ? !selectedFile : !looksLikeUrl(urlInput.value.trim());
}

// --- Input mode tabs (Upload file / Paste URL) ---

function setInputMode(mode) {
  inputMode = mode;
  const isUpload = mode === 'upload';
  tabUpload.classList.toggle('active', isUpload);
  tabUpload.setAttribute('aria-selected', String(isUpload));
  tabUrl.classList.toggle('active', !isUpload);
  tabUrl.setAttribute('aria-selected', String(!isUpload));
  panelUpload.hidden = !isUpload;
  panelUrl.hidden = isUpload;
  updateProcessButtonState();
}

tabUpload.addEventListener('click', () => setInputMode('upload'));
tabUrl.addEventListener('click', () => setInputMode('url'));
urlInput.addEventListener('input', updateProcessButtonState);

// --- Upload box interactions (click-to-browse + drag-and-drop) ---

uploadBox.addEventListener('click', () => fileInput.click());
uploadBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener('change', () => {
  setSelectedFile(fileInput.files[0] || null);
});

['dragenter', 'dragover'].forEach((evt) => {
  uploadBox.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadBox.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach((evt) => {
  uploadBox.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadBox.classList.remove('dragover');
  });
});

uploadBox.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) setSelectedFile(file);
});

// --- Process ---
// Both input modes call the same backend pipeline (POST /api/extract or
// POST /api/extract-url both funnel into server/index.js's shared
// processRawText()), so the response shape — and everything below that
// handles it — is identical regardless of which mode was used.

async function runExtraction() {
  if (inputMode === 'upload') {
    const formData = new FormData();
    formData.append('document', selectedFile);
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: window.EKGAuth.authHeaders(),
      body: formData,
    });
    return res.json();
  }

  const res = await fetch('/api/extract-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...window.EKGAuth.authHeaders() },
    body: JSON.stringify({ url: urlInput.value.trim() }),
  });
  return res.json();
}

processButton.addEventListener('click', async () => {
  if (inputMode === 'upload' && !selectedFile) return;
  if (inputMode === 'url' && !looksLikeUrl(urlInput.value.trim())) return;

  processButton.disabled = true;
  resultsSection.hidden = true;
  setStatus(
    inputMode === 'upload'
      ? 'Processing — this can take a bit for longer documents…'
      : 'Fetching the page with a headless browser, then processing — this can take a bit…',
    'info'
  );

  try {
    const data = await runExtraction();

    if (!data.ok) {
      setStatus(data.error || 'Extraction failed.', 'error');
      return;
    }

    currentRows = data.rows;
    renderResults(data.rows, data.narrativeSummary);
    setStatus(`Extracted ${data.rows.length} row${data.rows.length === 1 ? '' : 's'}.`, 'success');
  } catch (err) {
    setStatus(`Request failed: ${err.message}`, 'error');
  } finally {
    updateProcessButtonState();
  }
});

// --- Results rendering ---

function cellText(value) {
  if (value === null || value === undefined || value === '') return '—'; // em dash for empty
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString('en-US');
  return String(value);
}

function renderResults(rows, narrativeSummary) {
  tableBody.innerHTML = '';
  let flaggedCount = 0;

  for (const row of rows) {
    const tr = document.createElement('tr');
    const elevateField = row.elevateToGroupNote;
    const isFlagged = Boolean(elevateField && elevateField.value);
    if (isFlagged) {
      tr.classList.add('row-flagged');
      flaggedCount += 1;
    }

    for (const col of schemaColumns) {
      const td = document.createElement('td');
      const field = row[col.key];
      td.textContent = cellText(field ? field.value : null);
      if (field && field.source_note) {
        td.title = field.source_note;
        td.classList.add('has-note');
      }
      if (col.key === 'elevateToGroupNote' && isFlagged) {
        td.classList.add('flag-note-cell');
      }
      tr.appendChild(td);
    }

    tableBody.appendChild(tr);
  }

  if (flaggedCount) {
    flaggedSummary.textContent = `⚠ ${flaggedCount} of ${rows.length} row${rows.length === 1 ? '' : 's'} flagged for review`;
    flaggedSummary.className = 'flagged-summary flagged-summary-warn';
  } else {
    flaggedSummary.textContent = `All ${rows.length} row${rows.length === 1 ? '' : 's'} passed quality checks`;
    flaggedSummary.className = 'flagged-summary flagged-summary-ok';
  }

  narrativeBody.innerHTML = '';
  const paragraphs = (narrativeSummary || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  for (const paragraph of paragraphs) {
    const p = document.createElement('p');
    p.textContent = paragraph;
    narrativeBody.appendChild(p);
  }

  resultsSection.hidden = false;
}

// --- Download ---

downloadButton.addEventListener('click', async () => {
  if (!currentRows) return;

  downloadButton.disabled = true;
  try {
    const res = await fetch('/api/export/excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...window.EKGAuth.authHeaders() },
      body: JSON.stringify({ rows: currentRows }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Export failed.');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ekg-export.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    setStatus(`Download failed: ${err.message}`, 'error');
  } finally {
    downloadButton.disabled = false;
  }
});
