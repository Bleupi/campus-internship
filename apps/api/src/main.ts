import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const corsOrigins = (process.env.CORS_ORIGINS ?? "").split(",").filter(Boolean);
  app.enableCors({ origin: corsOrigins });

  const port = process.env.API_PORT ?? 3000;
  await app.listen(port);
}

bootstrap();
