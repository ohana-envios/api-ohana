import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { MyCustomerController } from './my-customer.controller.js';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [CustomersController, MyCustomerController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
