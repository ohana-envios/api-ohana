import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import { OperationalUserGuard } from './operational-user.guard.js';
import { RequireRoles } from './require-roles.decorator.js';
import { RolesGuard } from './roles.guard.js';
import { operationalRoles, type OperationalUser, type OperationalUserRequest, type UserList } from './users.types.js';
import { UsersService } from './users.service.js';
import { parseUserListQuery } from './users.query.js';

@Controller('users')
@UseGuards(OperationalUserGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  list(@Query() query: Record<string, unknown>): Promise<UserList> {
    return this.users.list(parseUserListQuery(query));
  }

  @Get('me')
  @RequireRoles(...operationalRoles)
  @Header('Cache-Control', 'no-store')
  me(@Req() request: OperationalUserRequest): OperationalUser {
    return request.currentUser!;
  }
}
