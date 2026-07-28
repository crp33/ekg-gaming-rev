// ---------------------------------------------------------------------------
// Supabase module
// ---------------------------------------------------------------------------
// Purpose: reads/writes to a Supabase (Postgres) project — data storage,
// auth, etc.
//
// Setup when implementing:
//   npm install @supabase/supabase-js
//
// Requires SUPABASE_URL and SUPABASE_KEY to be set in .env (see
// .env.example). Use the service_role key server-side only — never expose
// it to the front end.
//
// Example shape once implemented:
//
//   const { createClient } = require('@supabase/supabase-js');
//   const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
//
//   async function getRows(table) {
//     const { data, error } = await supabase.from(table).select('*');
//     if (error) throw error;
//     return data;
//   }
//
//   module.exports = { getRows };

async function getRows(_table) {
  throw new Error('supabase module not yet implemented');
}

module.exports = { getRows };
