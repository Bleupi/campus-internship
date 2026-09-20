import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  createStageDraftSchema,
  listStagesQuerySchema,
  type CreateStageDraftRequest,
  type ListStagesQuery,
} from "shared";
import type { Request } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StagesService } from "./stages.service";

function currentUserId(req: Request): string {
  return (req.user as { id: string }).id;
}

@Controller("stages")
@UseGuards(RolesGuard)
@Roles("STUDENT")
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  @Post()
  createDraft(
    @Body(new ZodValidationPipe(createStageDraftSchema)) dto: CreateStageDraftRequest,
    @Req() req: Request,
  ) {
    return this.stagesService.createDraft(currentUserId(req), dto);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listStagesQuerySchema)) query: ListStagesQuery,
    @Req() req: Request,
  ) {
    return this.stagesService.list(currentUserId(req), query);
  }

  @Get(":id")
  getById(@Param("id") id: string, @Req() req: Request) {
    return this.stagesService.getById(currentUserId(req), id);
  }
}
