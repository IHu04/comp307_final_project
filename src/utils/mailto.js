// builds mailto: uris for owner/student email notifications
// uses mailto links instead of smtp so the app has no email server dependency
// the generated uri pre-populates subject and body in the user's default mail client
export function buildMailtoUri(to, subject, body) {
  const base = `mailto:${String(to || '').trim()}`;
  const parts = [];
  if (subject) parts.push('subject=' + encodeURIComponent(String(subject)));
  if (body) parts.push('body=' + encodeURIComponent(String(body)));
  return parts.length ? `${base}?${parts.join('&')}` : base;
}
