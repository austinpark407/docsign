function resolveAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:3000';
}

/** Server-side settings, all from environment variables. See .env.example. */
export const config = {
  appName: process.env.APP_NAME || 'docsign',
  /** Shown to signers and in emails as the sender, e.g. "Acme Plumbing". */
  orgName: process.env.ORG_NAME || process.env.APP_NAME || 'docsign',
  appUrl: resolveAppUrl().replace(/\/$/, ''),
  defaultExpiresDays: Number(process.env.DEFAULT_EXPIRES_DAYS || 30),
};
