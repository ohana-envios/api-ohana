import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { parseCorsOrigins } from './config/environment.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  try {
    const config = app.get(ConfigService);
    const origins = parseCorsOrigins(config.getOrThrow<string>('CORS_ORIGINS'));

    app.setGlobalPrefix('api');
    app.enableCors({ origin: origins, credentials: false });
    app.enableShutdownHooks();
    await app.listen(config.getOrThrow<number>('PORT'));
  } catch (error) {
    await app.close();
    throw error;
  }
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start API', error);
  process.exitCode = 1;
});
