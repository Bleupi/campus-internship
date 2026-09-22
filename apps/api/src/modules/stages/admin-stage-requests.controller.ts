import { Controller, Get, UseGuards } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AdminStageRequestsService } from "./admin-stage-requests.service";

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
}
