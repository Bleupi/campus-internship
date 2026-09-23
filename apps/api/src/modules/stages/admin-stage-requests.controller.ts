import { Body, Controller, Get, Param, Patch, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { refuseStageSchema, type AuthUser } from "shared";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AdminStageRequestsService } from "./admin-stage-requests.service";
import type { RefuseStageDto } from "./dto/refuse-stage.dto";

// req.user is populated by JwtStrategy.validate() (see jwt.strategy.ts),
// shaped like AuthUser. BR-11's refusal email names whichever admin actually
// called this route, and BR-08's snapshot records their identity — both read
// straight off the request rather than accepting it as client input.
function currentAdmin(req: Request): Pick<AuthUser, "id" | "firstName" | "lastName"> {
  const user = req.user as AuthUser;
  return { id: user.id, firstName: user.firstName, lastName: user.lastName };
}

// Issue #146: admin-facing reads of stage requests live with the stages domain
// (so ADR-0029's flag gates them with the rest of stage management), in their
// own controller because StagesController is scoped to STUDENT.
@Controller("admin/stage-requests")
@UseGuards(RolesGuard)
@Roles("ADMIN")
export class AdminStageRequestsController {
  constructor(private readonly adminStageRequestsService: AdminStageRequestsService) {}

  @Get()
  list() {
    return this.adminStageRequestsService.list();
  }

  // Issue #147: the row-expand detail, everything the student provided.
  @Get(":id")
  getById(@Param("id") id: string) {
    return this.adminStageRequestsService.getById(id);
  }

  // Issue #151 (BR-03, BR-08, BR-09): PENDING -> REFUSED.
  @Patch(":id/refuse")
  refuse(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(refuseStageSchema)) dto: RefuseStageDto,
    @Req() req: Request,
  ) {
    return this.adminStageRequestsService.refuse(id, dto, currentAdmin(req));
  }
}
