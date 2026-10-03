// Small fetch wrapper for the PokerWiz API: JSON in, JSON out, readable errors.

export async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach the server. Is the API running?');
  }

  // 204 has no body; other responses are JSON (errors look like { error: "..." }).
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  // Password lock (server/auth): signed out or expired, so go sign in and come back to this page.
  if (response.status === 401 && data?.error === 'Login required') {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }
  if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status})`);
  return data;
}
