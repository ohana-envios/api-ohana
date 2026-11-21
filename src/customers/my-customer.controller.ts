import { Body, Controller, Get, Header, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { OperationalUserGuard } from '../users/operational-user.guard.js';
import { RequireRoles } from '../users/require-roles.decorator.js';
import { RolesGuard } from '../users/roles.guard.js';
import type { OperationalUserRequest } from '../users/users.types.js';
import { parseAddress, parseAddressStatus } from './customers.address.js';
import { parseCustomerEdit } from './customers.edit.js';
import { CustomersService } from './customers.service.js';

@Controller('my-customer')
@UseGuards(OperationalUserGuard, RolesGuard)
@RequireRoles('CUSTOMER')
export class MyCustomerController {
  constructor(private readonly customers: CustomersService) {}
  @Get() @Header('Cache-Control', 'no-store')
  get(@Req() request: OperationalUserRequest) { return this.customers.getOwn(request.currentUser!.id); }
  @Patch() @Header('Cache-Control', 'no-store')
  async update(@Req() request: OperationalUserRequest, @Body() body: unknown) {
    const draft = parseCustomerEdit(body); const actor = request.currentUser!.id;
    const own = await this.customers.getOwn(actor); return this.customers.update(own.id, draft, actor);
  }
  @Post('addresses') @Header('Cache-Control', 'no-store')
  async add(@Req() request: OperationalUserRequest, @Body() body: unknown) {
    const draft = parseAddress(body, false); const actor = request.currentUser!.id;
    const own = await this.customers.getOwn(actor); return this.customers.addAddress(own.id, draft, actor);
  }
  @Patch('addresses/:addressId') @Header('Cache-Control', 'no-store')
  async edit(@Req() request: OperationalUserRequest, @Param('addressId') addressId: string, @Body() body: unknown) {
    const draft = parseAddress(body, true); const actor = request.currentUser!.id;
    const own = await this.customers.getOwn(actor); return this.customers.updateAddress(own.id, addressId, draft, actor);
  }
  @Patch('addresses/:addressId/status') @Header('Cache-Control', 'no-store')
  async status(@Req() request: OperationalUserRequest, @Param('addressId') addressId: string, @Body() body: unknown) {
    const active = parseAddressStatus(body); const actor = request.currentUser!.id;
    const own = await this.customers.getOwn(actor); return this.customers.setAddressStatus(own.id, addressId, active, actor);
  }
}
