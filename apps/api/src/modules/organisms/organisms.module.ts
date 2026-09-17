import { Module } from "@nestjs/common";
import { OrganismsController } from "./organisms.controller";
import { OrganismsService } from "./organisms.service";

@Module({
  controllers: [OrganismsController],
  providers: [OrganismsService],
  exports: [OrganismsService],
})
export class OrganismsModule {}
