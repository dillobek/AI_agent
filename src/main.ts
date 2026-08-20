import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppConfigService } from './config/app-config.service';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';

async function bootstrap() {
  // bodyParser: false — we install express.json() ourselves below with a
  // `verify` hook that captures the exact raw request bytes onto
  // `req.rawBody`. The Finance webhook needs those exact bytes (not the
  // re-serialized parsed JSON) to validate its HMAC signature.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = app.get(AppConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());
  app.use(requestIdMiddleware);
  app.use(
    express.json({
      limit: '2mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // Reject requests carrying properties not declared on the DTO instead
      // of silently stripping them — surfaces client bugs and blocks
      // mass-assignment-style parameter pollution early.
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter(config));

  const corsOrigin = config.get('DASHBOARD_CORS_ORIGIN');
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  });

  // Swagger is a documentation/introspection surface for the API — only
  // expose it outside production, or behind an explicit opt-in.
  if (!config.isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('AI Personal Assistant Ecosystem')
      .setDescription('NestJS Orchestrator API - Telegram, Drive/Obsidian, Gemini Agent, Medical CRM & Finance')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get('PORT');
  await app.listen(port);
  logger.log(`🚀 AI Personal Assistant Ecosystem running on http://localhost:${port}`);
  if (!config.isProduction) {
    logger.log(`📚 Swagger docs available at http://localhost:${port}/api/docs`);
  }
}
bootstrap();
