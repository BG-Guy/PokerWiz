// The login page for the password lock (see auth/session.js), as one self-contained HTML page: nothing from the
// app itself loads until the password is right. Same colors and fonts as the app, light and dark.
// locked: deployed without a password set, so there is nothing to type: it explains how to set one.

const SPADE =
  'M12 2s-8 6.2-8 11.2c0 2.6 2 4.3 4.3 4.3 1.3 0 2.5-.6 3.2-1.5-.2 2-1 3.6-2.5 5h6c-1.5-1.4-2.3-3-2.5-5 .7.9 1.9 1.5 3.2 1.5 2.3 0 4.3-1.7 4.3-4.3C20 8.2 12 2 12 2z';

export function loginPage({ locked = false } = {}) {
  const body = locked
    ? `<p class="text">This PokerWiz is locked because no password is set yet. To open it, add <code>APP_PASSWORD</code> in the
        service's Environment settings on Render, then deploy again.</p>`
    : `<p class="text">This PokerWiz is private. Enter the password to continue.</p>
      <form id="login" novalidate>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
        <button type="submit">Unlock</button>
        <p id="error" class="error" role="alert"></p>
      </form>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <meta name="theme-color" content="#12181B" />
  <title>PokerWiz · Sign in</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Nunito:wght@600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root { --bg: #f6fbfb; --surface: #fff; --border: #d3e6e4; --text: #12181b; --muted: #3f5a60; --accent: #7fc8c2; --accent-text: #2c6e68; --negative: #c0514a; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #12181b; --surface: #1a2327; --border: #2b3b41; --text: #f6fbfb; --muted: #a9c3c5; --accent-text: #7fc8c2; --negative: #ec8c82; }
    }
    * { box-sizing: border-box; margin: 0; }
    body { min-height: 100dvh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--text); font-family: 'Nunito', system-ui, sans-serif; }
    .card { width: 100%; max-width: 380px; padding: 28px 24px; border-radius: 24px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 8px 24px rgba(18, 24, 27, 0.08); }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; font-family: 'Fredoka', system-ui, sans-serif; font-size: 24px; font-weight: 700; }
    .mark { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--accent); color: #12181b; }
    .brand span:last-child span { color: var(--accent-text); }
    .text { color: var(--muted); font-weight: 600; line-height: 1.5; margin-bottom: 18px; }
    code { font-weight: 800; color: var(--text); }
    form { display: flex; flex-direction: column; gap: 8px; }
    label { font-weight: 800; font-size: 14px; }
    input { font: inherit; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg); color: var(--text); }
    input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
    button { font: inherit; font-weight: 800; margin-top: 6px; min-height: 46px; border: 0; border-radius: 999px; background: var(--accent); color: #12181b; cursor: pointer; }
    button:disabled { opacity: 0.6; cursor: default; }
    .error { min-height: 1.4em; color: var(--negative); font-weight: 700; font-size: 14px; }
  </style>
</head>
<body>
  <main class="card">
    <div class="brand">
      <span class="mark"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="${SPADE}" /></svg></span>
      <span>Poker<span>Wiz</span></span>
    </div>
    ${body}
  </main>
  ${
    locked
      ? ''
      : `<script>
    // Send the password; on success go back to the page that asked for it (same site only).
    const form = document.getElementById('login');
    const input = document.getElementById('password');
    const error = document.getElementById('error');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      button.disabled = true;
      error.textContent = '';
      try {
        const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: input.value }) });
        if (response.ok) {
          const next = new URLSearchParams(location.search).get('next') || '/';
          location.replace(next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\\\') ? next : '/');
          return;
        }
        const data = await response.json().catch(() => ({}));
        error.textContent = data.error || 'Could not sign in.';
      } catch {
        error.textContent = 'Could not reach PokerWiz. Check your connection.';
      }
      button.disabled = false;
      input.select();
    });
  </script>`
  }
</body>
</html>`;
}
