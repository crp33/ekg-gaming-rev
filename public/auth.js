// ---------------------------------------------------------------------------
// Auth module — email/password login gate (Supabase Auth)
// ---------------------------------------------------------------------------
// Purpose: shows a login form and blocks the rest of the UI until a user
// signs in.
//
// OPTIONAL BY CONFIGURATION, matching server/modules/supabase.js and
// server/middleware/auth.js: this calls GET /api/config on load, and if
// authRequired is false (Supabase isn't set up), it skips the login screen
// entirely and reveals the tool immediately — exactly how the tool worked
// before this feature existed. New users are created in the Supabase
// dashboard (Authentication -> Users) — there's no public sign-up form here
// on purpose, since this is an internal tool.
//
// Exposes window.EKGAuth.authHeaders() for app.js to attach the current
// user's access token to protected API requests, and dispatches an
// 'ekg:tool-ready' event (on window) each time the tool becomes visible, so
// app.js knows when it's safe to load schema-dependent UI.

const loginSection = document.getElementById('login-section');
const toolSection = document.getElementById('tool-section');
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const loginButton = document.getElementById('login-button');
const authStatus = document.getElementById('auth-status');
const signOutButton = document.getElementById('sign-out-button');

let supabaseClient = null;
let currentSession = null;

function announceToolReady() {
  window.dispatchEvent(new CustomEvent('ekg:tool-ready'));
}

function showLogin() {
  loginSection.hidden = false;
  toolSection.hidden = true;
}

function showTool() {
  loginSection.hidden = true;
  toolSection.hidden = false;
  announceToolReady();
}

function renderAuthStatus() {
  if (currentSession) {
    authStatus.textContent = currentSession.user.email;
    signOutButton.hidden = false;
  } else {
    signOutButton.hidden = true;
  }
}

async function init() {
  const res = await fetch('/api/config');
  const config = await res.json();

  if (!config.authRequired) {
    authStatus.textContent = 'Running without login — Supabase not configured';
    signOutButton.hidden = true;
    showTool();
    return;
  }

  // window.supabase is the UMD build loaded via <script> in index.html —
  // no bundler in this project, so this is the supported no-build-step way
  // to use the Supabase JS client in the browser.
  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  const { data } = await supabaseClient.auth.getSession();
  currentSession = data.session;
  renderAuthStatus();
  currentSession ? showTool() : showLogin();

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    renderAuthStatus();
    session ? showTool() : showLogin();
  });
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  loginButton.disabled = true;
  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: loginEmail.value,
      password: loginPassword.value,
    });
    if (error) {
      loginError.textContent = error.message;
    } else {
      loginPassword.value = '';
    }
  } finally {
    loginButton.disabled = false;
  }
});

signOutButton.addEventListener('click', async () => {
  if (supabaseClient) await supabaseClient.auth.signOut();
});

window.EKGAuth = {
  authHeaders() {
    if (!currentSession) return {};
    return { Authorization: `Bearer ${currentSession.access_token}` };
  },
};

init();
