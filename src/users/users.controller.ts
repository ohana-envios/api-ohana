import { Body, Controller, Get, Header, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { OperationalUserGuard } from './operational-user.guard.js';
import { RequireRoles } from './require-roles.decorator.js';
import { RolesGuard } from './roles.guard.js';
import { operationalRoles, type OperationalUser, type OperationalUserRequest, type UserList } from './users.types.js';
import { UsersService } from './users.service.js';
import { parseUserListQuery } from './users.query.js';
import { parseInternalUser } from './users.create.js';
import { parseAccessChange } from './users.access.js';

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

  @Post()
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  createInternal(@Req() request: OperationalUserRequest, @Body() body: unknown) {
    return this.users.createInternal(request.currentUser!.id, parseInternalUser(body));
  }

  @Get('me')
  @RequireRoles(...operationalRoles)
  @Header('Cache-Control', 'no-store')
  me(@Req() request: OperationalUserRequest): OperationalUser {
    return request.currentUser!;
  }

  @Patch(':userId/access')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  updateAccess(@Param('userId') id: string, @Body() body: unknown, @Req() request: OperationalUserRequest) {
    return this.users.updateAccess(request.currentUser!.id, id, parseAccessChange(body));
  }
}
