import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';

/** Call only after the existing access-token guard has verified this token and subject. */
export async function verifiedRegistrationIdentity(
  issuer: string, token: string, subject: string, request: typeof fetch = fetch,
): Promise<{ subject: string; email: string }> {
  let response: Response;
  try {
    response = await request(`${issuer}/oidc/v1/userinfo`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new ServiceUnavailableException('Identity service unavailable');
  }
  if (!response.ok) throw new ServiceUnavailableException('Identity service unavailable');
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new ServiceUnavailableException('Identity service unavailable'); }
  if (!value || typeof value !== 'object') throw new ForbiddenException('Verified identity required');
  const claims = value as { sub?: unknown; email?: unknown; email_verified?: unknown };
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (!subject || claims.sub !== subject || claims.email_verified !== true || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ForbiddenException('Verified identity required');
  }
  return { subject, email };
}
