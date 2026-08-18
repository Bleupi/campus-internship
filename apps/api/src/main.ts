import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger("Bootstrap");

  const corsOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (corsOrigins.length === 0) {
    logger.warn(
      "CORS_ORIGINS is unset or empty — no origin is allowed, every cross-origin request will be blocked.",
    );
  }

  app.enableCors({ origin: corsOrigins });

  const port = process.env.API_PORT ?? 3000;
  await app.listen(port);
}

bootstrap();
