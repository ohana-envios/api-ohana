import { Body, Controller, Get, Header, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { OperationalUserGuard } from '../users/operational-user.guard.js';
import { RequireRoles } from '../users/require-roles.decorator.js';
import { RolesGuard } from '../users/roles.guard.js';
import { parseCustomerListQuery } from './customers.query.js';
import { CustomersService } from './customers.service.js';
import { parseCustomerEdit } from './customers.edit.js';
import { parseAddress, parseAddressStatus } from './customers.address.js';
import type { CustomerDetail, CustomerList } from './customers.types.js';

@Controller('customers')
@UseGuards(OperationalUserGuard, RolesGuard)
@RequireRoles('ADMIN')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: Record<string, unknown>): Promise<CustomerList> {
    return this.customers.list(parseCustomerListQuery(query));
  }

  @Get(':customerId')
  @Header('Cache-Control', 'no-store')
  get(@Param('customerId') customerId: string): Promise<CustomerDetail> {
    return this.customers.get(customerId);
  }

  @Patch(':customerId')
  @Header('Cache-Control', 'no-store')
  update(@Param('customerId') customerId: string, @Body() body: unknown): Promise<CustomerDetail> {
    return this.customers.update(customerId, parseCustomerEdit(body));
  }

  @Post(':customerId/addresses')
  @Header('Cache-Control', 'no-store')
  addAddress(@Param('customerId') customerId: string, @Body() body: unknown): Promise<CustomerDetail> {
    return this.customers.addAddress(customerId, parseAddress(body, false));
  }

  @Patch(':customerId/addresses/:addressId')
  @Header('Cache-Control', 'no-store')
  updateAddress(@Param('customerId') customerId: string, @Param('addressId') addressId: string, @Body() body: unknown): Promise<CustomerDetail> {
    return this.customers.updateAddress(customerId, addressId, parseAddress(body, true));
  }

  @Patch(':customerId/addresses/:addressId/status')
  @Header('Cache-Control', 'no-store')
  setAddressStatus(@Param('customerId') customerId: string, @Param('addressId') addressId: string, @Body() body: unknown): Promise<CustomerDetail> {
    return this.customers.setAddressStatus(customerId, addressId, parseAddressStatus(body));
  }
}
