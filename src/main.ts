import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { fastifyMultipart } from '@fastify/multipart';
import { ValidationPipe } from '@nestjs/common';

import { AppModule } from './app.module';
import { registerFastifyPlugin } from './common/fastify';
import metadata from './metadata';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 50 * 1024 * 1024 }),
    {
      snapshot: true,
    },
  );

  await registerFastifyPlugin(app, fastifyMultipart);

  app.enableCors({
    origin: 'http://localhost:3000',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  app.setGlobalPrefix('api/v1/');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // 启用自动类型转换
      whitelist: true, // 自动去除不需要的字段
      forbidNonWhitelisted: true, // 拒绝非白名单中的字段
    }),
  );

  const config = new DocumentBuilder().setTitle('接口文档').setVersion('1.0').build();

  /** @see https://github.com/nestjs/swagger/issues/2493 */
  await SwaggerModule.loadPluginMetadata(metadata);

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'openApiJson',
  });

  await app.listen(
    {
      port: 8080,
      host: '0.0.0.0',
    },
    (err, address) => {
      if (err) {
        console.error('Error starting server:', err);
        process.exit(1);
      }

      console.log(`Server is running on ${address}`);
    },
  );
}

bootstrap();
