import { Module } from "@nestjs/common";
import { MailerModule } from "../mailer/mailer.module";
import { AdminStageRequestsController } from "./admin/admin-stage-requests.controller";
import { AdminStageRequestsService } from "./admin/admin-stage-requests.service";
import { StagesController } from "./student/stages.controller";
import { StagesService } from "./student/stages.service";

@Module({
  imports: [MailerModule],
  controllers: [StagesController, AdminStageRequestsController],
  providers: [StagesService, AdminStageRequestsService],
})
export class StagesModule {}
