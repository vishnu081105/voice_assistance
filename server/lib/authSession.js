export function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role ?? "doctor",
    user_metadata: {
      full_name: user.full_name ?? null,
    },
  };
}

export function toSession(user) {
  const expiresIn = 60 * 60 * 24 * 7;
  return {
    access_token: "",
    token_type: "bearer",
    expires_in: expiresIn,
    user: toPublicUser(user),
  };
}
