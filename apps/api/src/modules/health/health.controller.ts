import { Controller, Get } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";

// Liveness only, not readiness: no database query, no other dependency check.
// The container entrypoint's migration step already proves database
// reachability at boot, so a transient DB blip shouldn't fail this check.
@Controller("health")
export class HealthController {
  @Public()
  @Get()
  check(): { status: "ok" } {
    return { status: "ok" };
  }
}
