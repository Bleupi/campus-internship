import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import type { Env } from "./config/env.schema";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger("Bootstrap");
  const configService = app.get<ConfigService<Env, true>>(ConfigService);

  app.use(cookieParser());

  const corsOrigins = configService.get("CORS_ORIGINS", { infer: true });
  if (corsOrigins.length === 0) {
    logger.warn(
      "CORS_ORIGINS is unset or empty — no origin is allowed, every cross-origin request will be blocked.",
    );
  }
  // credentials: true is required alongside cookie-based auth — without it
  // the browser won't send/accept the access_token/refresh_token cookies
  // cross-origin (apps/web's api-client.ts already sends credentials: "include").
  app.enableCors({ origin: corsOrigins, credentials: true });

  const port = configService.get("API_PORT", { infer: true });
  await app.listen(port);
}

bootstrap();
