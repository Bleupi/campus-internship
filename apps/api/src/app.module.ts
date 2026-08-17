import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { StudentsModule } from "./modules/students/students.module";
import { ReferentsModule } from "./modules/referents/referents.module";
import { StagesModule } from "./modules/stages/stages.module";
import { OrganismsModule } from "./modules/organisms/organisms.module";
import { AdminModule } from "./modules/admin/admin.module";
import { FilesModule } from "./modules/files/files.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env"],
    }),
    PrismaModule,
    AuthModule,
    StudentsModule,
    ReferentsModule,
    StagesModule,
    OrganismsModule,
    AdminModule,
    FilesModule,
  ],
})
export class AppModule {}
