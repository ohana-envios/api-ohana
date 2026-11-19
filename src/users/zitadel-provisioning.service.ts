import { BadGatewayException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type InviteInput = { email: string; firstName: string; lastName: string };
type ZitadelCreateResponse = { id?: string };

@Injectable()
export class ZitadelProvisioningService {
  private readonly issuer: string;
  private readonly organizationId: string;
  private readonly serviceToken: string;
  private readonly inviterSubjects: Set<string>;

  constructor(config: ConfigService) {
    this.issuer = config.get<string>('ZITADEL_ISSUER_URL') ?? '';
    this.organizationId = config.get<string>('ZITADEL_ORG_ID') ?? '';
    this.serviceToken = config.get<string>('ZITADEL_USER_SERVICE_TOKEN') ?? '';
    this.inviterSubjects = new Set(
      (config.get<string>('ZITADEL_USER_INVITER_SUBJECTS') ?? '').split(',').map((value) => value.trim()).filter(Boolean),
    );
  }

  canInvite(subject: string): boolean {
    return Boolean(this.issuer && this.organizationId && this.serviceToken && this.inviterSubjects.has(subject));
  }

  async invite(input: InviteInput): Promise<{ userId: string; email: string; invitation: 'sent' }> {
    if (!this.issuer || !this.organizationId || !this.serviceToken) {
      throw new ServiceUnavailableException('La invitación de usuarios no está configurada');
    }

    let response: Response;
    try {
      response = await fetch(`${this.issuer}/v2/users/new`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.serviceToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          organizationId: this.organizationId,
          username: input.email,
          human: {
            profile: {
              givenName: input.firstName,
              familyName: input.lastName,
              displayName: `${input.firstName} ${input.lastName}`,
              preferredLanguage: 'es',
            },
            email: { email: input.email, sendCode: {} },
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ServiceUnavailableException('No se pudo conectar con el servicio de identidad');
    }

    if (!response.ok) {
      if (response.status === 409) throw new ConflictException('Ya existe una cuenta con ese correo');
      if (response.status === 401 || response.status === 403) {
        throw new ServiceUnavailableException('La credencial de administración de ZITADEL no tiene permisos para crear usuarios');
      }
      throw new BadGatewayException('ZITADEL no pudo crear la cuenta. Revisá la configuración y volvé a intentar.');
    }

    let result: ZitadelCreateResponse;
    try {
      result = await response.json() as ZitadelCreateResponse;
    } catch {
      throw new BadGatewayException('ZITADEL respondió con un resultado inválido');
    }
    if (typeof result.id !== 'string' || !result.id) {
      throw new BadGatewayException('ZITADEL no devolvió el identificador de la cuenta');
    }

    return { userId: result.id, email: input.email, invitation: 'sent' };
  }
}
