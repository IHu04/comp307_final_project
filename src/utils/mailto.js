// builds mailto: uris for owner/student email notifications
// uses mailto links instead of smtp so the app has no email server dependency
// the generated uri pre-populates subject and body in the user's default mail client
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
  return parts.length ? `${base}?${parts.join('&')}` : base;
}
