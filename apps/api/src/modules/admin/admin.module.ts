import { Module } from "@nestjs/common";
import { AdminStudentsController } from "./admin-students.controller";
import { AdminStudentsService } from "./admin-students.service";

@Module({
  controllers: [AdminStudentsController],
  providers: [AdminStudentsService],
})
export class AdminModule {}
