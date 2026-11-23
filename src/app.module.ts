import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { validateEnvironment } from './config/environment.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { RegistrationModule } from './registrations/registration.module.js';
import { CouriersModule } from './couriers/couriers.module.js';
import { ShipmentsModule } from './shipments/shipments.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    RegistrationModule,
    CouriersModule,
    ShipmentsModule,
  ],
})
export class AppModule {}
