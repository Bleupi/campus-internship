import { BadRequestException, PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

// Hand-rolled validation pipe for Zod, deliberately replacing Nest's default
// class-validator convention (see CLAUDE.md §5 / ADR-0019): the project's
// request/response contracts are Zod schemas shared with the frontend, and
// duplicating those rules in class-validator would reintroduce the exact
// divergence risk ADR-0012 exists to prevent.
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const message = result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      );
      throw new BadRequestException({ message });
    }

    return result.data;
  }
}
