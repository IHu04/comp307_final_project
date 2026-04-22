// strips private fields (password_hash, etc.) before sending user data in api responses

// maps a raw db row (snake_case) to the public-facing user shape (camelCase)
export function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    isOwner: Boolean(row.is_owner),
    inviteToken: row.invite_token ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
