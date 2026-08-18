import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import type { Env } from "./config/env.schema";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger("Bootstrap");
  const configService = app.get<ConfigService<Env, true>>(ConfigService);

  const corsOrigins = configService.get("CORS_ORIGINS", { infer: true });
  if (corsOrigins.length === 0) {
    logger.warn(
      "CORS_ORIGINS is unset or empty — no origin is allowed, every cross-origin request will be blocked.",
    );
  }
  app.enableCors({ origin: corsOrigins });

  const port = configService.get("API_PORT", { infer: true });
  await app.listen(port);
}

bootstrap();
