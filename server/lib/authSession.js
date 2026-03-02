export function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    user_metadata: {
      full_name: user.full_name ?? null,
    },
  };
}

export function toSession(user, accessToken) {
  const expiresIn = 60 * 60 * 24 * 7;
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: expiresIn,
    user: toPublicUser(user),
  };
}

