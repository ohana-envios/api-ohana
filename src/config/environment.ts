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

  const issuerValue = values.ZITADEL_ISSUER_URL ?? '';
  const projectValue = values.ZITADEL_PROJECT_ID ?? '';
  const clientsValue = values.ZITADEL_WEB_CLIENT_IDS ?? '';
  const apiClientId = values.ZITADEL_API_CLIENT_ID ?? '';
  const apiClientSecret = values.ZITADEL_API_CLIENT_SECRET ?? '';
  if ([issuerValue, projectValue, clientsValue, apiClientId, apiClientSecret].some((value) => typeof value !== 'string')) {
    throw new Error('ZITADEL configuration must be strings');
  }
  const issuer = (issuerValue as string).trim();
  const projectId = (projectValue as string).trim();
  const clientIds = (clientsValue as string).split(',').map((client) => client.trim()).filter(Boolean);
  if ([projectId, clientIds.length, (apiClientId as string).trim(), (apiClientSecret as string).trim()].some((value) => Boolean(issuer) !== Boolean(value))) {
    throw new Error('All ZITADEL variables must be configured together');
  }
  if (nodeEnv === 'production' && !issuer) {
    throw new Error('ZITADEL configuration is required in production');
  }
  if (issuer) {
    let url: URL;
    try {
      url = new URL(issuer);
    } catch {
      throw new Error('ZITADEL_ISSUER_URL must be an HTTPS origin');
    }
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
      throw new Error('ZITADEL_ISSUER_URL must be an HTTPS origin');
    }
  }

  if (projectId && !/^\d+$/.test(projectId)) {
    throw new Error('ZITADEL_PROJECT_ID must be a numeric project ID');
  }
  if (clientIds.some((client) => !/^[\w@-]+$/.test(client)) || (apiClientId as string).trim() && !/^[\w@-]+$/.test((apiClientId as string).trim())) {
    throw new Error('ZITADEL client ID is invalid');
  }

  return { ...values, NODE_ENV: nodeEnv, PORT: port, DATABASE_URL: databaseUrl, CORS_ORIGINS: corsOrigins, ZITADEL_ISSUER_URL: issuer.replace(/\/$/, ''), ZITADEL_PROJECT_ID: projectId, ZITADEL_WEB_CLIENT_IDS: clientIds.join(','), ZITADEL_API_CLIENT_ID: (apiClientId as string).trim(), ZITADEL_API_CLIENT_SECRET: apiClientSecret };
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
