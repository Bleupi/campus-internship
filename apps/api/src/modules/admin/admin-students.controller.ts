import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { rejectProfileSchema, type AuthUser } from "shared";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AdminStudentsService } from "./admin-students.service";
import type { RejectProfileDto } from "./dto/reject-profile.dto";

// req.user is populated by JwtStrategy.validate() (see jwt.strategy.ts),
// shaped like AuthUser (same cast as auth.controller.ts's /me). BR-11's
// validation/refusal emails name whichever admin actually called this
// route, so we read it straight off the request rather than accepting it
// as client input.
function currentAdmin(req: Request): Pick<AuthUser, "firstName" | "lastName"> {
  const user = req.user as AuthUser;
  return { firstName: user.firstName, lastName: user.lastName };
}

// Issue #13: the two admin-triggered ProfileStatus transitions. Issue #43
// adds the certificate proxy stream these transitions act on — still
// backend-only in scope for #13, but the admin queue UI (#41/#42) now exists
// and is what actually calls all three routes below.
@Controller("admin/students/:id/profile")
@UseGuards(RolesGuard)
@Roles("ADMIN")
export class AdminStudentsController {
  constructor(private readonly adminStudentsService: AdminStudentsService) {}

  // ADR-0024: proxied stream, never a presigned URL — RolesGuard(ADMIN)
  // above covers every request the same way it covers validate/reject.
  @Get("certificate")
  async getCertificate(@Param("id") studentId: string): Promise<StreamableFile> {
    const { stream, mimeType } = await this.adminStudentsService.getCertificateStream(studentId);
    return new StreamableFile(stream, { type: mimeType });
  }

  @Patch("validate")
  validateProfile(@Param("id") studentId: string, @Req() req: Request) {
    return this.adminStudentsService.validateProfile(studentId, currentAdmin(req));
  }

  @Patch("reject")
  rejectProfile(
    @Param("id") studentId: string,
    @Body(new ZodValidationPipe(rejectProfileSchema)) dto: RejectProfileDto,
    @Req() req: Request,
  ) {
    return this.adminStudentsService.rejectProfile(studentId, dto.reason, currentAdmin(req));
  }
}
