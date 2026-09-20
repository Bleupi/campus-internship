import { Module } from "@nestjs/common";
import { MailerModule } from "../mailer/mailer.module";
import { StagesController } from "./stages.controller";
import { StagesService } from "./stages.service";

@Module({
  imports: [MailerModule],
  controllers: [StagesController],
  providers: [StagesService],
})
export class StagesModule {}
