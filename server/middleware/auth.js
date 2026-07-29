// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
// Purpose: gates protected routes behind a logged-in Supabase session.
//
// OPTIONAL BY CONFIGURATION, matching server/modules/supabase.js: if
// Supabase isn't configured, this middleware is a no-op that lets every
// request through — the tool runs exactly as it did before login existed.
// Once SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are set
// in .env, it starts requiring a valid `Authorization: Bearer <token>`
// header (the access token the browser gets from
// supabase.auth.signInWithPassword(), see public/auth.js) on every route
// it wraps.

const { isConfigured, verifyAccessToken } = require('../modules/supabase');

async function requireAuth(req, res, next) {
  if (!isConfigured()) {
    next();
    return;
  }

  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const user = await verifyAccessToken(token);

  if (!user) {
    res.status(401).json({ ok: false, error: 'Sign in required.' });
    return;
  }

  req.user = user;
  next();
}

module.exports = { requireAuth };
