import { LoggerService } from '@ai-platform/shared';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(LoggerService);
  const globalPrefix = 'api';
  const frontendOrigin = getFrontendOrigin();

  app.useLogger(logger);
  app.use(cookieParser());
  app.enableCors({
    origin: frontendOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix(globalPrefix);
  const port = Number(process.env.API_GATEWAY_PORT ?? 4000);
  await app.listen(port);
  logger.log(`api-gateway module started on port ${port}`);
  logger.log(`Application is running on: http://localhost:${port}/${globalPrefix}`);
}

function getFrontendOrigin(): string {
  if (process.env.NODE_ENV === 'development') {
    return `http://localhost:${process.env.FRONTEND_PORT ?? 3000}`;
  }

  const frontendUrl = process.env.FRONTEND_URL;

  if (!frontendUrl) {
    throw new Error('FRONTEND_URL is not configured');
  }

  return frontendUrl;
}

bootstrap();
