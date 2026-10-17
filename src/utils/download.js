// Saving files from the app (backups, spreadsheets) without leaving it. A plain link to the file would, in the
// Home Screen app, open a browser view over the app (with back and forward buttons). Instead the file is fetched
// and handed to iOS's share sheet (Save to Files, Mail, AirDrop...) or, elsewhere, saved as a download.
const isIos = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Save `blob` as `name`.
export async function saveBlob(blob, name) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  if (isIos() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return; // closed the share sheet
      // not allowed here (e.g. too long after the tap): fall back to a download
    }
  }
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Fetch a file from the API and save it under the name the server gives it (or `fallbackName`).
export async function saveFile(url, fallbackName = 'pokerwiz-file') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download the file (${response.status})`);
  const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  await saveBlob(await response.blob(), name);
}
