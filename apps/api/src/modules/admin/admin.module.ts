import { Module } from "@nestjs/common";
import { AdminStudentsController } from "./admin-students.controller";
import { AdminStudentsQueueController } from "./admin-students-queue.controller";
import { AdminStudentsQueueService } from "./admin-students-queue.service";
import { AdminStudentsService } from "./admin-students.service";

@Module({
  controllers: [AdminStudentsController, AdminStudentsQueueController],
  providers: [AdminStudentsService, AdminStudentsQueueService],
})
export class AdminModule {}
