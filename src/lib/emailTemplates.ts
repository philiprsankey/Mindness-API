const BRAND = {
  appName: process.env.APP_NAME ?? 'Mindness',
  slogan: 'Kindness for your mind',
  tagline: 'Talk · Understand · Grow',
  supportEmail: process.env.SUPPORT_EMAIL ?? 'info@mindness.co.uk',
  colors: {
    pageBg: '#EBE6DC',
    cardBg: '#FDFBF8',
    cardBorder: '#E5DFD4',
    foreground: '#231A12',
    muted: '#8A8072',
    primary: '#C9A664',
    primaryDark: '#5C4A32',
    codeBg: '#F0EBE3',
    codeBorder: '#D4B06A',
  },
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildVerificationEmail(code: string): { subject: string; html: string; text: string } {
  const { appName, slogan, tagline, supportEmail, colors } = BRAND;
  const safeCode = escapeHtml(code);
  const subject = `Your ${appName} verification code`;

  const text = [
    `${appName}`,
    slogan,
    tagline,
    '',
    'Verify your email address',
    '',
    `Your verification code is: ${code}`,
    '',
    'Enter this code in the Mindness app to complete your sign-up.',
    'This code expires in 15 minutes.',
    '',
    'If you did not create an account, you can safely ignore this email.',
    '',
    `Questions? ${supportEmail}`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${colors.pageBg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${colors.pageBg};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;background-color:${colors.cardBg};border:1px solid ${colors.cardBorder};border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid ${colors.cardBorder};">
              <p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:600;letter-spacing:8px;text-transform:uppercase;color:${colors.foreground};">
                ${escapeHtml(appName)}
              </p>
              <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:14px;font-style:italic;color:${colors.foreground};">
                ${escapeHtml(slogan)}
              </p>
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${colors.muted};">
                ${escapeHtml(tagline)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;">
              <p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${colors.primaryDark};">
                Email verification
              </p>
              <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:500;line-height:1.3;color:${colors.foreground};">
                Verify your email address
              </h1>
              <p style="margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;color:${colors.muted};">
                Welcome to ${escapeHtml(appName)}. Enter the code below in the app to finish creating your account and step into your sanctuary.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${colors.codeBg};border:1px solid ${colors.codeBorder};border-radius:12px;">
                <tr>
                  <td style="padding:24px;text-align:center;">
                    <p style="margin:0 0 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${colors.muted};">
                      Your verification code
                    </p>
                    <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:${colors.foreground};">
                      ${safeCode}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px;">
              <p style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.6;color:${colors.muted};">
                This code expires in <strong style="color:${colors.foreground};">15 minutes</strong>. For your security, do not share it with anyone.
              </p>
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.6;color:${colors.muted};">
                If you did not request this email, you can safely ignore it — no account will be created.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;text-align:center;background-color:${colors.codeBg};border-top:1px solid ${colors.cardBorder};">
              <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;color:${colors.muted};">
                Need help? We're here for you.
              </p>
              <a href="mailto:${escapeHtml(supportEmail)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:600;color:${colors.primary};text-decoration:none;">
                ${escapeHtml(supportEmail)}
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;line-height:1.5;color:${colors.muted};text-align:center;">
          © ${new Date().getFullYear()} ${escapeHtml(appName)}. ${escapeHtml(slogan)}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

export function buildPasswordResetEmail(code: string): { subject: string; html: string; text: string } {
  const { appName, slogan, tagline, supportEmail, colors } = BRAND;
  const safeCode = escapeHtml(code);
  const subject = `Reset your ${appName} password`;

  const text = [
    `${appName}`,
    slogan,
    tagline,
    '',
    'Reset your password',
    '',
    `Your password reset code is: ${code}`,
    '',
    'Enter this code in the Mindness app to choose a new password.',
    'This code expires in 15 minutes.',
    '',
    'If you did not request a password reset, you can safely ignore this email.',
    '',
    `Questions? ${supportEmail}`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${colors.pageBg};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${colors.pageBg};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;background-color:${colors.cardBg};border:1px solid ${colors.cardBorder};border-radius:16px;">
          <tr>
            <td style="padding:32px;text-align:center;border-bottom:1px solid ${colors.cardBorder};">
              <p style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:600;letter-spacing:8px;text-transform:uppercase;color:${colors.foreground};">${escapeHtml(appName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:26px;color:${colors.foreground};">Reset your password</h1>
              <p style="margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;color:${colors.muted};">
                Use the code below in the Mindness app to set a new password.
              </p>
              <p style="margin:0;font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;color:${colors.foreground};">${safeCode}</p>
              <p style="margin:24px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;color:${colors.muted};">
                This code expires in 15 minutes. If you did not request this, ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
