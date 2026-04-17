/**
 * Build a mailto: URI with encoded query parameters (RFC-style encoding).
 * @param {string} to - recipient email
 * @param {string} [subject]
 * @param {string} [body]
 */
export function buildMailtoUri(to, subject, body) {
  const addr = String(to || '').trim();
  const base = addr ? `mailto:${addr}` : 'mailto:';

  const parts = [];
  if (subject != null && String(subject).length > 0) {
    parts.push('subject=' + encodeURIComponent(String(subject)));
  }
  if (body != null && String(body).length > 0) {
    parts.push('body=' + encodeURIComponent(String(body)));
  }
  if (!parts.length) {
    return base;
  }
  return `${base}?${parts.join('&')}`;
}
