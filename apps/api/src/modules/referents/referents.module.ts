import { Module } from "@nestjs/common";
import { ReferentsController } from "./referents.controller";
import { ReferentsService } from "./referents.service";

@Module({
  controllers: [ReferentsController],
  providers: [ReferentsService],
})
export class ReferentsModule {}
