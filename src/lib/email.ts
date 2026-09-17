import { Resend } from 'resend';
import { buildPasswordResetEmail, buildVerificationEmail } from './emailTemplates';

const resendKey = process.env.RESEND_API_KEY?.trim();
const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'Mindness <onboarding@resend.dev>';

const resend = resendKey ? new Resend(resendKey) : null;

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  const { subject, html, text } = buildVerificationEmail(code);

  if (!resend) {
    console.info(`[email:dev] Verification code for ${to}: ${code}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: fromEmail,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    console.error('[email] Failed to send verification email', error);
    throw new Error('Could not send verification email');
  }
}

export async function sendPasswordResetEmail(to: string, code: string): Promise<void> {
  const { subject, html, text } = buildPasswordResetEmail(code);

  if (!resend) {
    console.info(`[email:dev] Password reset code for ${to}: ${code}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: fromEmail,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    console.error('[email] Failed to send password reset email', error);
    throw new Error('Could not send password reset email');
  }
}
