import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { AppConfig } from './config/config.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(AppConfig);

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({
    origin: config.get('CORS_ORIGINS').split(',').map((s) => s.trim()),
    credentials: true,
  });
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  app.useBodyParser('json', { limit: '4mb' });

  if (!config.isProd) {
    const doc = new DocumentBuilder()
      .setTitle('VP AI Job Copilot API')
      .setDescription('Resume intelligence, JD analysis, job matching, document generation and application tracking.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  }

  await app.listen(config.get('PORT'), '0.0.0.0');
}

void bootstrap();
