export function emailDomain(email) {
  const text = String(email).trim().toLowerCase();
  const at = text.indexOf('@');
  if (at < 1) {
    return null;
  }
  return text.slice(at + 1);
}

export function isMcGillStudentEmail(email) {
  const domain = emailDomain(email);
  return domain === 'mcgill.ca' || domain === 'mail.mcgill.ca';
}

// Owners use @mcgill.ca (not @mail.mcgill.ca — that string still ends in mcgill.ca but domain is mail.mcgill.ca)
export function isOwnerEmail(email) {
  return emailDomain(email) === 'mcgill.ca';
}
