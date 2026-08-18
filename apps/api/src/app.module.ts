import { join } from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { envSchema } from "./config/env.schema";
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
      // __dirname is apps/api/dist at runtime (nest build/start always run the
      // compiled output) — resolved from there, not process.cwd(), so this
      // doesn't depend on the launch path (Docker WORKDIR, IDE run config, ...).
      envFilePath: [join(__dirname, "../../../.env")],
      validate: (config) => envSchema.parse(config),
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
