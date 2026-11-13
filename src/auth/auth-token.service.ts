import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
type Introspection = { active?: boolean; iss?: string; aud?: string | string[]; client_id?: string; sub?: string; exp?: number; nbf?: number; token_type?: string };

export async function verifyAccessToken(
  token: string,
  issuer: string,
  projectId: string,
  apiClientId: string,
  apiClientSecret: string,
  allowedWebClientIds: readonly string[],
  request: typeof fetch = fetch,
): Promise<{ sub: string }> {
  let response: Response;
  try {
    const credentials = `${encodeURIComponent(apiClientId)}:${encodeURIComponent(apiClientSecret)}`;
    response = await request(`${issuer}/oauth/v2/introspect`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(credentials).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new ServiceUnavailableException('Authentication unavailable');
  }
  if (!response.ok) throw new ServiceUnavailableException('Authentication unavailable');
  let claims: Introspection;
  try { claims = await response.json() as Introspection; }
  catch { throw new ServiceUnavailableException('Authentication unavailable'); }
  const audience = typeof claims.aud === 'string' ? [claims.aud] : claims.aud;
  const now = Math.floor(Date.now() / 1000);
  if (claims.active !== true || claims.iss !== issuer || !audience?.includes(projectId) ||
    !claims.client_id || !allowedWebClientIds.includes(claims.client_id) ||
    typeof claims.sub !== 'string' || !claims.sub ||
    typeof claims.exp !== 'number' || claims.exp <= now ||
    (typeof claims.nbf === 'number' && claims.nbf > now) || claims.token_type !== 'Bearer') {
    throw new UnauthorizedException('Invalid access token');
  }
  return { sub: claims.sub };
}

@Injectable()
export class AuthTokenService {
  private readonly issuer: string;
  private readonly projectId: string;
  private readonly apiClientId: string;
  private readonly apiClientSecret: string;
  private readonly allowedWebClientIds: string[];

  constructor(config: ConfigService) {
    this.issuer = config.get<string>('ZITADEL_ISSUER_URL') ?? '';
    this.projectId = config.get<string>('ZITADEL_PROJECT_ID') ?? '';
    this.apiClientId = config.get<string>('ZITADEL_API_CLIENT_ID') ?? '';
    this.apiClientSecret = config.get<string>('ZITADEL_API_CLIENT_SECRET') ?? '';
    this.allowedWebClientIds = (config.get<string>('ZITADEL_WEB_CLIENT_IDS') ?? '').split(',').filter(Boolean);
  }

  verify(token: string): Promise<{ sub: string }> {
    if (!this.issuer || !this.apiClientId || !this.apiClientSecret) throw new ServiceUnavailableException('Authentication unavailable');
    return verifyAccessToken(token, this.issuer, this.projectId, this.apiClientId, this.apiClientSecret, this.allowedWebClientIds);
  }
}
