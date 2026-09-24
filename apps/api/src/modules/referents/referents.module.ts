import { Module } from "@nestjs/common";
import { AdminReferentsController } from "./admin-referents.controller";
import { ReferentsController } from "./referents.controller";
import { ReferentsService } from "./referents.service";

@Module({
  controllers: [ReferentsController, AdminReferentsController],
  providers: [ReferentsService],
})
export class ReferentsModule {}
