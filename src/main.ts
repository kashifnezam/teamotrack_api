import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

import helmet from 'helmet';
import compression from 'compression';

async function bootstrap() {

  const app =
    await NestFactory.create(AppModule);


  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );


  app.use(
    compression(),
  );


  /*
   * JWT authentication does not
   * require cookies/credentials.
   */
  app.enableCors({
    origin: true,
    credentials: false,
  });


  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );


  const port =
    Number(process.env.PORT) || 8080;


  await app.listen(
    port,
    '0.0.0.0',
  );


  console.log(
    `🚀 Server running on port ${port}`,
  );
}

bootstrap();