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

// Column metadata is fetched from /api/schema (server/config/ekg-schema.js)
// rather than duplicated here, so this file never drifts from the schema.
let schemaColumns = [];
let selectedFile = null;
let currentRows = null;

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
  processButton.disabled = !file;
  uploadBox.classList.toggle('has-file', Boolean(file));
}

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

processButton.addEventListener('click', async () => {
  if (!selectedFile) return;

  processButton.disabled = true;
  resultsSection.hidden = true;
  setStatus('Processing — this can take a bit for longer documents…', 'info');

  const formData = new FormData();
  formData.append('document', selectedFile);

  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: window.EKGAuth.authHeaders(),
      body: formData,
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      setStatus(data.error || 'Extraction failed.', 'error');
      return;
    }

    currentRows = data.rows;
    renderResults(data.rows, data.narrativeSummary);
    setStatus(`Extracted ${data.rows.length} row${data.rows.length === 1 ? '' : 's'}.`, 'success');
  } catch (err) {
    setStatus(`Request failed: ${err.message}`, 'error');
  } finally {
    processButton.disabled = false;
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
