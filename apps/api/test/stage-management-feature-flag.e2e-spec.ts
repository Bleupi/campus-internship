import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";

// Issue #113: with FEATURE_STAGE_MANAGEMENT off, StagesModule/OrganismsModule
// must never be part of the module graph at all — a true 404, not a
// guard-blocked 401/403. app.module.ts reads process.env.FEATURE_STAGE_MANAGEMENT
// exactly once, synchronously, when its @Module(...) decorator runs (i.e. at
// import time) — a static top-level `import` here would be hoisted ahead of
// setting the env var below, so both the env mutation and the require() of
// AppModule are done dynamically, in the right order, inside beforeAll.
describe("Stage management feature flag off (e2e)", () => {
  let app: INestApplication;
  let previousFlagValue: string | undefined;

  beforeAll(async () => {
    previousFlagValue = process.env.FEATURE_STAGE_MANAGEMENT;
    process.env.FEATURE_STAGE_MANAGEMENT = "false";
    jest.resetModules();

    // Dynamic import() (unlike a static `import`) runs exactly where it's
    // written, not hoisted ahead of the process.env assignment above.
    const { Test } = await import("@nestjs/testing");
    const { AppModule } = await import("../src/app.module");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    // Restore, so a later e2e file sharing this Jest worker process doesn't
    // inherit "false" — process.env is a real process global, not reset
    // between test files the way Jest's module registry is.
    if (previousFlagValue === undefined) {
      delete process.env.FEATURE_STAGE_MANAGEMENT;
    } else {
      process.env.FEATURE_STAGE_MANAGEMENT = previousFlagValue;
    }
  });

  it("POST /stages: 404 (module never registered), not 401", async () => {
    await request(app.getHttpServer()).post("/stages").send({}).expect(404);
  });

  it("GET /stages and GET /stages/:id: 404 (module never registered), not 401 (issue #114)", async () => {
    await request(app.getHttpServer()).get("/stages").expect(404);
    await request(app.getHttpServer()).get("/stages/some-id").expect(404);
  });

  it("GET /admin/stage-requests and GET /admin/stage-requests/:id: 404 (module never registered), not 401 (issues #146, #147)", async () => {
    await request(app.getHttpServer()).get("/admin/stage-requests").expect(404);
    await request(app.getHttpServer()).get("/admin/stage-requests/some-id").expect(404);
  });

  it("GET /organisms/search: 404 (module never registered), not 401", async () => {
    await request(app.getHttpServer()).get("/organisms/search?q=test").expect(404);
  });
});
