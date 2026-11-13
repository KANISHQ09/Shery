function normalizeUrl(value) {
  const normalized = (value || '').trim().replace(/\/+$/, '');

  if (!normalized) return '';
  if (/\.railway\.internal(?::\d+)?(?:\/|$)/i.test(normalized)) return '';
  if (/^\/\//.test(normalized)) return `https:${normalized}`;
  if (/^\//.test(normalized)) return normalized;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(normalized)) {
    return `http://${normalized}`;
  }

  return `https://${normalized}`;
}

export const API_BASE_URL = normalizeUrl(
  import.meta.env.VITE_API_BASE_URL || ''
);

export const API_DIRECT_URL = normalizeUrl(
  import.meta.env.VITE_API_DIRECT_URL ||
  API_BASE_URL
);

export function buildApiUrl(path, baseUrl = API_BASE_URL) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

// Largest video an instructor may upload. Keep in line with the storage provider's per-file limit
// (Supabase free plan: ~50 MB) and the server's MAX_VIDEO_UPLOAD_MB.
export const MAX_UPLOAD_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB) || 50;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
