import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { AdminStudentsController } from "./admin-students.controller";
import { AdminStudentsQueueController } from "./admin-students-queue.controller";
import { AdminStudentsQueueService } from "./admin-students-queue.service";
import { AdminStudentsService } from "./admin-students.service";

@Module({
  imports: [FilesModule],
  controllers: [AdminStudentsController, AdminStudentsQueueController],
  providers: [AdminStudentsService, AdminStudentsQueueService],
})
export class AdminModule {}
