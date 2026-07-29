// ---------------------------------------------------------------------------
// Supabase module
// ---------------------------------------------------------------------------
// Purpose: (1) persists each processed dataset (extracted rows + narrative)
// to Postgres via Supabase, and (2) verifies user sessions for the
// email/password login gate in server/middleware/auth.js.
//
// OPTIONAL BY CONFIGURATION: if SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
// not set, this module runs in a disabled state — isConfigured() returns
// false, saveDataset() is a documented no-op, and server/middleware/auth.js
// skips the login requirement entirely. This mirrors server/modules/playwright.js
// being optional: the upload -> extract -> export flow keeps working with
// zero external services configured, exactly as it did before this module
// existed. Set the env vars (see .env.example) to turn auth + persistence on.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env for this
// (server-side) client — used to verify user JWTs and to write rows,
// bypassing Row Level Security (a trusted server credential; never expose
// it to the browser). The browser uses a *different*, public-safe key —
// SUPABASE_ANON_KEY, served via GET /api/config — see public/auth.js.
//
// Table schema + how to point Tableau at the same database: supabase/schema.sql.

const { createClient } = require('@supabase/supabase-js');
const { columns } = require('../config/ekg-schema');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const client =
  SUPABASE_URL && SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

function isConfigured() {
  return client !== null;
}

// camelCase ekg-schema.js key -> snake_case Postgres column name, e.g.
// grossGamingRevenue -> gross_gaming_revenue. Column names in
// supabase/schema.sql are hand-written to match this exactly.
function toSnakeCase(camelKey) {
  return camelKey.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Verifies a user's access token (sent by the browser as
 * `Authorization: Bearer <token>`, from supabase.auth.signInWithPassword()
 * in public/auth.js) against Supabase Auth.
 * @param {string | null} accessToken
 * @returns {Promise<object | null>} the Supabase user object, or null if the
 *   token is missing, invalid, or expired.
 */
async function verifyAccessToken(accessToken) {
  if (!client || !accessToken) return null;
  try {
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return data.user;
  } catch (err) {
    // Network/DNS failure reaching Supabase, malformed token, etc. — treat
    // as "not authenticated" rather than letting requireAuth's middleware
    // chain crash on an unhandled rejection.
    console.error('Supabase token verification failed:', err.message);
    return null;
  }
}

/**
 * Persists one processed dataset: a `datasets` row plus one `extracted_rows`
 * row per extracted row. Best-effort by design — server/index.js calls this
 * after extraction has already succeeded and must not let a storage failure
 * stop it from returning results to the user.
 * @param {{ rows: object[], narrativeSummary: string, uploadedBy?: string|null, sourceFilename?: string|null }} params
 * @returns {Promise<{ saved: false, reason: string } | { saved: true, datasetId: string }>}
 */
async function saveDataset({ rows, narrativeSummary, uploadedBy, sourceFilename }) {
  if (!client) {
    return { saved: false, reason: 'Supabase is not configured' };
  }

  const flaggedCount = rows.filter((row) => row.elevateToGroupNote && row.elevateToGroupNote.value).length;

  const { data: dataset, error: datasetError } = await client
    .from('datasets')
    .insert({
      uploaded_by: uploadedBy || null,
      source_filename: sourceFilename || null,
      narrative_summary: narrativeSummary,
      row_count: rows.length,
      flagged_count: flaggedCount,
    })
    .select()
    .single();

  if (datasetError) {
    throw new Error(`Failed to insert dataset: ${datasetError.message}`);
  }

  const extractedRowRecords = rows.map((row) => {
    const record = { dataset_id: dataset.id };
    const sourceNotes = {};
    for (const col of columns) {
      const field = row[col.key];
      record[toSnakeCase(col.key)] = field ? field.value : null;
      if (field && field.source_note) sourceNotes[col.key] = field.source_note;
    }
    record.source_notes = sourceNotes;
    return record;
  });

  const { error: rowsError } = await client.from('extracted_rows').insert(extractedRowRecords);
  if (rowsError) {
    throw new Error(`Failed to insert extracted rows: ${rowsError.message}`);
  }

  return { saved: true, datasetId: dataset.id };
}

module.exports = { isConfigured, verifyAccessToken, saveDataset };
