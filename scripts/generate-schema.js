// Regenerates the `extracted_rows` column block in supabase/schema.sql from
// server/config/ekg-schema.js — the same source of truth (and the same
// toSnakeCase mapping) server/modules/supabase.js uses for real inserts, so
// the table can't silently drift from what the app actually writes.
//
// Run after adding/removing/renaming a column in ekg-schema.js:
//   npm run generate-schema
//
// Only rewrites the block between the `-- BEGIN GENERATED COLUMNS` /
// `-- END GENERATED COLUMNS` markers in supabase/schema.sql — the
// hand-written docs, the `datasets` table, indexes, and RLS policies around
// it are untouched.

const fs = require('fs');
const path = require('path');
const { columns } = require('../server/config/ekg-schema');
const { toSnakeCase } = require('../server/modules/supabase');

const SCHEMA_PATH = path.join(__dirname, '..', 'supabase', 'schema.sql');
const BEGIN_MARKER = '  -- BEGIN GENERATED COLUMNS';
const END_MARKER = '  -- END GENERATED COLUMNS';

function postgresTypeFor(columnType) {
  switch (columnType) {
    case 'number':
      return 'numeric';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'timestamptz';
    case 'string':
    default:
      return 'text';
  }
}

function buildColumnLines() {
  return columns
    .map((col) => `  ${toSnakeCase(col.key)} ${postgresTypeFor(col.type)}, -- ${col.header}`)
    .join('\n');
}

function main() {
  const original = fs.readFileSync(SCHEMA_PATH, 'utf8');

  const beginIndex = original.indexOf(BEGIN_MARKER);
  const endIndex = original.indexOf(END_MARKER);
  if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
    throw new Error(
      `Could not find BEGIN/END GENERATED COLUMNS markers in ${SCHEMA_PATH} — has the file structure changed?`
    );
  }

  const before = original.slice(0, beginIndex + BEGIN_MARKER.length);
  const after = original.slice(endIndex);
  const updated = `${before}\n${buildColumnLines()}\n${after}`;

  if (updated === original) {
    console.log(`supabase/schema.sql already matches ekg-schema.js (${columns.length} columns) — no changes.`);
    return;
  }

  fs.writeFileSync(SCHEMA_PATH, updated);
  console.log(`Regenerated supabase/schema.sql — ${columns.length} columns synced from ekg-schema.js.`);
}

main();
