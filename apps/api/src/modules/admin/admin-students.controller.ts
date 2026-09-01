import { Body, Controller, Param, Patch, UseGuards } from "@nestjs/common";
import { rejectProfileSchema } from "shared";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AdminStudentsService } from "./admin-students.service";
import type { RejectProfileDto } from "./dto/reject-profile.dto";

// Issue #13: the two admin-triggered ProfileStatus transitions. Backend-only
// — no admin queue UI in this slice (fogged on the wayfinder map, issue #4).
@Controller("admin/students/:id/profile")
@UseGuards(RolesGuard)
@Roles("ADMIN")
export class AdminStudentsController {
  constructor(private readonly adminStudentsService: AdminStudentsService) {}

  @Patch("validate")
  validateProfile(@Param("id") studentId: string) {
    return this.adminStudentsService.validateProfile(studentId);
  }

  @Patch("reject")
  rejectProfile(
    @Param("id") studentId: string,
    @Body(new ZodValidationPipe(rejectProfileSchema)) dto: RejectProfileDto,
  ) {
    return this.adminStudentsService.rejectProfile(studentId, dto.reason);
  }
}
