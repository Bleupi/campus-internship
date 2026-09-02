import { Controller, Get, UseGuards } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AdminStudentsQueueService } from "./admin-students-queue.service";

// Issue #42: queue-list slice of #41 (admin certificate-validation queue).
// Separate controller from AdminStudentsController — that one's base path is
// scoped to a single "admin/students/:id/profile", this is an unscoped list.
@Controller("admin/students/certificate-queue")
@UseGuards(RolesGuard)
@Roles("ADMIN")
export class AdminStudentsQueueController {
  constructor(private readonly adminStudentsQueueService: AdminStudentsQueueService) {}

  @Get()
  list() {
    return this.adminStudentsQueueService.list();
  }
}
