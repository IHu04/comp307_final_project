// email domain helpers for mcgill address validation
// @mcgill.ca = professor/ta (is_owner = true), @mail.mcgill.ca = student (is_owner = false)
// both domains register; only @mcgill.ca gets owner flag

// extract the domain part of an email, e.g. "mail.mcgill.ca"
function emailDomain(email) {
  const text = String(email).trim().toLowerCase();
  const at = text.indexOf('@');
  if (at < 1) return null;
  return text.slice(at + 1);
}

// returns true for any valid mcgill address (student or owner)
// used as an express-validator custom() check at registration
export function isMcGillStudentEmail(email) {
  const domain = emailDomain(email);
  return domain === 'mcgill.ca' || domain === 'mail.mcgill.ca';
}

// returns true only for @mcgill.ca (professor/ta accounts)
// note: @mail.mcgill.ca ends with "mcgill.ca" as a substring, but this check is intentionally exact
export function isOwnerEmail(email) {
  return emailDomain(email) === 'mcgill.ca';
}
