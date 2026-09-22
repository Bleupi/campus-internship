import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { searchOrganismsQuerySchema, type SearchOrganismsQuery } from "shared";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { OrganismsService } from "./organisms.service";

// Student-facing by default (issue #113's wizard) — the admin's own
// host-organism screen is a separate, already-tracked PRD area. structure-types
// is the exception: issue #146's admin stage-requests list (StructureTypeLabel)
// also calls it, to colour each row by the same configured types, so it
// overrides the class-level role to accept either.
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
  @Roles("STUDENT", "ADMIN")
  listStructureTypes() {
    return this.organismsService.listStructureTypes();
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.organismsService.findById(id);
  }
}
