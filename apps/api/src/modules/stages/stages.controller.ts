import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  createStageDraftSchema,
  listStagesQuerySchema,
  updateStageDraftSchema,
  type CreateStageDraftRequest,
  type ListStagesQuery,
  type UpdateStageDraftRequest,
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

  @Post(":id/submit")
  submit(@Param("id") id: string, @Req() req: Request) {
    return this.stagesService.submit(currentUserId(req), id);
  }

  @Patch(":id")
  updateDraft(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateStageDraftSchema)) dto: UpdateStageDraftRequest,
    @Req() req: Request,
  ) {
    return this.stagesService.updateDraft(currentUserId(req), id, dto);
  }

  @Get(":id")
  getById(@Param("id") id: string, @Req() req: Request) {
    return this.stagesService.getById(currentUserId(req), id);
  }
}
