import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import {
  idPhotoMimeTypeSchema,
  insuranceCertificateMimeTypeSchema,
  updateProfileSchema,
} from "shared";
import type { z } from "zod";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StudentsService } from "./students.service";
import type { UpdateProfileDto } from "./dto/update-profile.dto";

// req.user is populated by JwtStrategy.validate() (see jwt.strategy.ts) —
// only { id, email, firstName, lastName, roles }, no profile data.
function currentUserId(req: Request): string {
  return (req.user as { id: string }).id;
}

const ID_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const INSURANCE_CERTIFICATE_MAX_BYTES = 10 * 1024 * 1024;

function mimeTypeFilter(schema: z.ZodTypeAny) {
  return (
    _req: Request,
    file: Express.Multer.File,
    callback: (error: Error | null, accept: boolean) => void,
  ) => {
    if (!schema.safeParse(file.mimetype).success) {
      callback(new BadRequestException(`Type de fichier non autorisé : ${file.mimetype}`), false);
      return;
    }
    callback(null, true);
  };
}

// First route in the app to combine @UseGuards(RolesGuard) with @Roles(...):
// JwtAuthGuard (global) only proves "who", RolesGuard (opt-in per route)
// checks "allowed to do this" — kept separate so most routes that only need
// authentication don't pay for a metadata/reflection lookup they don't use.
@Controller("students/me/profile")
@UseGuards(RolesGuard)
@Roles("STUDENT")
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  getProfile(@Req() req: Request) {
    return this.studentsService.getProfile(currentUserId(req));
  }

  @Patch()
  updateProfile(
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
    @Req() req: Request,
  ) {
    return this.studentsService.updateProfile(currentUserId(req), dto);
  }

  @Post("id-photo")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: ID_PHOTO_MAX_BYTES },
      fileFilter: mimeTypeFilter(idPhotoMimeTypeSchema),
    }),
  )
  uploadIdPhoto(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    return this.studentsService.uploadFile(currentUserId(req), "ID_PHOTO", file);
  }

  @Post("insurance-certificate")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: INSURANCE_CERTIFICATE_MAX_BYTES },
      fileFilter: mimeTypeFilter(insuranceCertificateMimeTypeSchema),
    }),
  )
  uploadInsuranceCertificate(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    return this.studentsService.uploadFile(currentUserId(req), "INSURANCE_CERTIFICATE", file);
  }
}
