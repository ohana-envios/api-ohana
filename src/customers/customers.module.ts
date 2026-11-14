import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CustomersService } from './customers.service.js';

// No controllers: HTTP integration awaits the shared user/permission contract.
@Module({
  imports: [PrismaModule],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
