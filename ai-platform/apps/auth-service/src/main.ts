import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { LoggerService } from '@ai-platform/shared';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = app.get(LoggerService);
  app.useLogger(logger);

  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.enableCors({
    origin: process.env.CLIENT_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  const port = process.env.AUTH_SERVICE_PORT || 4002;
  await app.listen(port);
  logger.log(`auth-service module started on port ${port}`, 'AuthService');
  logger.log(`Application is running on: http://localhost:${port}/${globalPrefix}`, 'AuthService');
}

bootstrap();
