import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { createReferentSchema, type CreateReferentRequest } from "shared";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { ReferentsService } from "./referents.service";

// Issue #150 (ADR-0031): add a referent on the fly from the assignment
// picker. Lives in the referents domain, so it follows the same
// FEATURE_STAGE_MANAGEMENT registration (ADR-0029), under the admin/ route
// prefix ADR-0031 names — same split as stages' AdminStageRequestsController.
@Controller("admin/referents")
@UseGuards(RolesGuard)
@Roles("ADMIN")
export class AdminReferentsController {
  constructor(private readonly referentsService: ReferentsService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createReferentSchema)) dto: CreateReferentRequest) {
    return this.referentsService.create(dto);
  }
}
