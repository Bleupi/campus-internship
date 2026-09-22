import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { assignReferentSchema, type AssignReferentRequest } from "shared";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { ReferentsService } from "./referents.service";

// Issue #148: the referents domain, joining the conditionally-registered
// (FEATURE_STAGE_MANAGEMENT) set alongside stages/organisms (ADR-0029).
@Controller("referents")
@UseGuards(RolesGuard)
@Roles("ADMIN")
export class ReferentsController {
  constructor(private readonly referentsService: ReferentsService) {}

  @Get()
  list() {
    return this.referentsService.list();
  }

  @Patch("assignments")
  assign(@Body(new ZodValidationPipe(assignReferentSchema)) dto: AssignReferentRequest) {
    return this.referentsService.assign(dto);
  }
}
