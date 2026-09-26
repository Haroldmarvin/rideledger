import api, { withBlobMessage } from './api';

function filenameFrom(headers, fallback) {
  const cd = headers['content-disposition'] || '';
  const m = /filename="?([^"]+)"?/i.exec(cd);
  return m ? m[1] : fallback;
}

/** Download an authenticated file (Excel/PDF export) through the API. */
export async function downloadFile(url, params, fallbackName) {
  let res;
  try {
    res = await api.get(url, { params, responseType: 'blob', timeout: 120000 });
  } catch (e) {
    throw await withBlobMessage(e); // decode the server's friendly message from the Blob body
  }
  const blobUrl = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filenameFrom(res.headers, fallbackName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}

/** Fetch an authenticated file and return an object URL (receipt viewing). */
export async function fetchObjectUrl(url) {
  let res;
  try {
    res = await api.get(url, { responseType: 'blob' });
  } catch (e) {
    throw await withBlobMessage(e);
  }
  return { url: URL.createObjectURL(res.data), type: res.data.type };
}
