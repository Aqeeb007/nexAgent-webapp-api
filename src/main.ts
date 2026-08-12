import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ConsoleLogger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({
      prefix: 'NexAgent',
    }),
  });
  const configService = app.get(ConfigService);
  app.setGlobalPrefix('api/v1');
  await app.listen(configService.get<number>('port') ?? 3000);
}
bootstrap();
