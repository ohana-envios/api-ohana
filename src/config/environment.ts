export function validateEnvironment(values: Record<string, unknown>): Record<string, unknown> {
  const nodeEnv = values.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(String(nodeEnv))) {
    throw new Error('NODE_ENV must be development, test or production');
  }

  const port = Number(values.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const databaseUrl = values.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || !databaseUrl.trim()) {
    throw new Error('DATABASE_URL is required');
  }
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('DATABASE_URL must be a PostgreSQL URL');
  }

  const corsOrigins = values.CORS_ORIGINS ?? '';
  if (typeof corsOrigins !== 'string') {
    throw new Error('CORS_ORIGINS must be a comma-separated string');
  }
  parseCorsOrigins(corsOrigins);

  const issuerValue = values.AUTH0_ISSUER_BASE_URL ?? '';
  const audienceValue = values.AUTH0_AUDIENCE ?? '';
  if (typeof issuerValue !== 'string' || typeof audienceValue !== 'string') {
    throw new Error('Auth0 configuration must be strings');
  }
  const issuer = issuerValue.trim();
  const audience = audienceValue.trim();
  if (Boolean(issuer) !== Boolean(audience)) {
    throw new Error('AUTH0_ISSUER_BASE_URL and AUTH0_AUDIENCE must be configured together');
  }
  if (nodeEnv === 'production' && !issuer) {
    throw new Error('Auth0 configuration is required in production');
  }
  if (issuer) {
    let url: URL;
    try {
      url = new URL(issuer);
    } catch {
      throw new Error('AUTH0_ISSUER_BASE_URL must be an HTTPS origin');
    }
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
      throw new Error('AUTH0_ISSUER_BASE_URL must be an HTTPS origin');
    }
  }

  return { ...values, NODE_ENV: nodeEnv, PORT: port, DATABASE_URL: databaseUrl, CORS_ORIGINS: corsOrigins, AUTH0_ISSUER_BASE_URL: issuer ? `${issuer.replace(/\/$/, '')}/` : '', AUTH0_AUDIENCE: audience };
}

export function parseCorsOrigins(value: string): string[] {
  const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }
  }
  return origins;
}
