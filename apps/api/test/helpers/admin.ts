import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import request from "supertest";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { cookieHeader, cookieMap } from "./cookies";

// No admin signup route exists — every e2e spec that needs an authenticated
// admin seeds one directly via Prisma (matching how the rest of the system
// creates ADMIN users out of band) and logs in through /auth/login for the
// session cookie. Pushes the seeded email onto `createdUserEmails` so the
// caller's usual afterAll cleanup picks it up.
export async function seedAdminAndLogin(
  app: INestApplication,
  prisma: PrismaService,
  createdUserEmails: string[],
): Promise<string> {
  const email = `e2e.admin.${randomUUID()}@etu.u-paris.fr`;
  const password = "an-admin-password-long-enough";
  createdUserEmails.push(email);
  await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      firstName: "Admin",
      lastName: "Test",
      roles: ["ADMIN"],
    },
  });
  const login = await request(app.getHttpServer())
    .post("/auth/login")
    .send({ email, password })
    .expect(200);
  return cookieHeader(cookieMap(login));
}
