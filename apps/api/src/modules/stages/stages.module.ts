import { Module } from "@nestjs/common";
import { MailerModule } from "../mailer/mailer.module";
import { AdminStageRequestsController } from "./admin-stage-requests.controller";
import { AdminStageRequestsService } from "./admin-stage-requests.service";
import { StagesController } from "./stages.controller";
import { StagesService } from "./stages.service";

@Module({
  imports: [MailerModule],
  controllers: [StagesController, AdminStageRequestsController],
  providers: [StagesService, AdminStageRequestsService],
})
export class StagesModule {}
