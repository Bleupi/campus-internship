import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { S3ServiceException } from "@aws-sdk/client-s3";

// Shared translation point for S3/MinIO errors (CLAUDE.md §5: don't let raw
// AWS errors reach the client), mirroring PrismaExceptionFilter. Registered
// once as a global APP_FILTER (app.module.ts). Every S3 error here is an
// infra/config problem, not something the client can act on — always a
// generic 500, with the real detail logged server-side.
@Catch(S3ServiceException)
export class S3ExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(S3ExceptionFilter.name);

  catch(exception: S3ServiceException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    this.logger.error(
      `Unhandled S3 error ${exception.name}: ${exception.message}`,
      exception.stack,
    );
    const translated = new InternalServerErrorException(
      "Une erreur est survenue lors de l'envoi du fichier.",
    );
    response.status(translated.getStatus()).json(translated.getResponse());
  }
}
