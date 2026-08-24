import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Response } from "express";
import { Prisma } from "@prisma/client";

// Shared translation point for Prisma errors (CLAUDE.md §5: "don't let raw
// Prisma errors reach the client"). Registered once as a global APP_FILTER
// (app.module.ts) so every module gets this for free instead of each
// service hand-rolling its own P2002/P2025/... catch block.
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const translated = this.translate(exception);
    response.status(translated.getStatus()).json(translated.getResponse());
  }

  private translate(exception: Prisma.PrismaClientKnownRequestError): HttpException {
    switch (exception.code) {
      case "P2002":
        return new ConflictException(this.conflictMessage(exception));
      case "P2025":
        return new NotFoundException("Ressource introuvable");
      case "P2003":
        return new BadRequestException("Référence invalide");
      default:
        this.logger.error(
          `Unhandled Prisma error ${exception.code}: ${exception.message}`,
          exception.stack,
        );
        return new InternalServerErrorException("Une erreur est survenue");
    }
  }

  private conflictMessage(exception: Prisma.PrismaClientKnownRequestError): string {
    const target = exception.meta?.target;
    if (Array.isArray(target) && target.includes("email")) {
      return "Un compte existe déjà avec cette adresse email";
    }
    return "Cette ressource existe déjà";
  }
}
