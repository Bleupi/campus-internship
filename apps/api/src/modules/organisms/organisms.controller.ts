import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { searchOrganismsQuerySchema, type SearchOrganismsQuery } from "shared";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { OrganismsService } from "./organisms.service";

// Student-facing only in this batch (issue #113's wizard) — the admin's own
// host-organism screen is a separate, already-tracked PRD area.
@Controller("organisms")
@UseGuards(RolesGuard)
@Roles("STUDENT")
export class OrganismsController {
  constructor(private readonly organismsService: OrganismsService) {}

  @Get("search")
  search(@Query(new ZodValidationPipe(searchOrganismsQuerySchema)) query: SearchOrganismsQuery) {
    return this.organismsService.search(query.q);
  }

  @Get("structure-types")
  listStructureTypes() {
    return this.organismsService.listStructureTypes();
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.organismsService.findById(id);
  }
}
