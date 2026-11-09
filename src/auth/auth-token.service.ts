import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export async function verifyAccessToken(
  token: string,
  keySet: JWTVerifyGetKey,
  issuer: string,
  audience: string,
): Promise<{ sub: string }> {
  try {
    const { payload } = await jwtVerify(token, keySet, {
      issuer,
      audience,
      algorithms: ['RS256'],
    });
    if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
      throw new Error('Missing required claims');
    }
    return { sub: payload.sub };
  } catch {
    throw new UnauthorizedException('Invalid access token');
  }
}

@Injectable()
export class AuthTokenService {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly keySet: JWTVerifyGetKey | null;

  constructor(config: ConfigService) {
    this.issuer = config.get<string>('AUTH0_ISSUER_BASE_URL') ?? '';
    this.audience = config.get<string>('AUTH0_AUDIENCE') ?? '';
    this.keySet = this.issuer
      ? createRemoteJWKSet(new URL('.well-known/jwks.json', this.issuer), { timeoutDuration: 5000 })
      : null;
  }

  verify(token: string): Promise<{ sub: string }> {
    if (!this.keySet) throw new ServiceUnavailableException('Authentication unavailable');
    return verifyAccessToken(token, this.keySet, this.issuer, this.audience);
  }
}
