import { BadRequestException, Body, Controller, Get, Header, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { OperationalUserGuard } from '../users/operational-user.guard.js';
import { RolesGuard } from '../users/roles.guard.js';
import { RequireRoles } from '../users/require-roles.decorator.js';
import type { OperationalUserRequest } from '../users/users.types.js';
import { parseCourierWrite } from './courier-input.js';
import { CouriersService } from './couriers.service.js';

@Controller('couriers')
@UseGuards(OperationalUserGuard, RolesGuard)
@RequireRoles('ADMIN')
export class CouriersController {
  constructor(private readonly couriers: CouriersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => !['search', 'page'].includes(key)) ||
        (query.search !== undefined && (typeof query.search !== 'string' || query.search.length > 120)) ||
        (query.page !== undefined && (typeof query.page !== 'string' || !/^[1-9]\d{0,4}$/.test(query.page)))) {
      throw new BadRequestException('Consulta inválida');
    }
    return this.couriers.list(typeof query.search === 'string' ? query.search.trim() : '', Number(query.page ?? 1));
  }

  @Get('possible-duplicate')
  @Header('Cache-Control', 'no-store')
  duplicate(@Query() query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => !['name', 'exclude'].includes(key)) || typeof query.name !== 'string' ||
        !query.name.trim() || query.name.trim().length > 120 ||
        (query.exclude !== undefined && (typeof query.exclude !== 'string' || query.exclude.length > 128))) {
      throw new BadRequestException('Consulta inválida');
    }
    return this.couriers.possibleDuplicate(query.name.trim(), typeof query.exclude === 'string' ? query.exclude : undefined);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Req() req: OperationalUserRequest, @Body() body: unknown) {
    return this.couriers.save(req.currentUser!.id, null, parseCourierWrite(body, false));
  }

  @Patch(':id/user')
  @Header('Cache-Control', 'no-store')
  linkUser(@Req() req: OperationalUserRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Vínculo inválido');
    const input = body as Record<string, unknown>;
    const valid = (value: unknown) => value === null || (typeof value === 'string' && value.trim().length > 0 && value.length <= 128);
    if (Object.keys(input).length !== 2 || !valid(input.userId) || !valid(input.expectedUserId)) throw new BadRequestException('Vínculo inválido');
    return this.couriers.linkUser(req.currentUser!.id, id, input.userId as string | null, input.expectedUserId as string | null);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  update(@Req() req: OperationalUserRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.couriers.save(req.currentUser!.id, id, parseCourierWrite(body, true));
  }
}
