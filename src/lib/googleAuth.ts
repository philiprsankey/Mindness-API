import { OAuth2Client } from 'google-auth-library';

const clientId = process.env.GOOGLE_CLIENT_ID?.trim();

export type GoogleProfile = {
  googleId: string;
  email: string;
  firstName: string | null;
};

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (!clientId) {
    throw new Error('Google sign-in is not configured');
  }

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email) {
    throw new Error('Invalid Google token');
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    firstName: payload.given_name ?? null,
  };
}
