# ADR-0019 — Request validation via a hand-rolled Zod pipe, not `class-validator`

- Status: Accepted
- Date: 2026-08-21
- Deciders: project owner

## Context

Nest's own documentation defaults to `class-validator` + `class-transformer` for request-body validation: decorate a DTO class with `@IsEmail()`/`@MinLength()`/etc., wire Nest's built-in `ValidationPipe` globally, done. Issue #10's signup/login endpoints are the first controllers in this codebase to need any request validation at all, so this default is the first real fork in the road for the API layer.

This project's shared request/response contract is already Zod (`ADR-0012`'s `schoolYear` value-object, and now `signupSchema`/`loginSchema` in `packages/shared`), consumed by both `apps/api` and `apps/web`'s `react-hook-form` + `@hookform/resolvers/zod`. Introducing `class-validator` alongside that would mean two parallel, unrelated ways of expressing "what a valid signup payload looks like" — one on the backend DTO class, one in the shared Zod schema the frontend already resolves against. Keeping both in sync by hand is exactly the divergence risk `ADR-0012` was written to prevent for `schoolYear`, just generalized to every request shape instead of one value-object.

## Decision

Request validation goes through a small hand-written `ZodValidationPipe` (`apps/api/src/common/pipes/zod-validation.pipe.ts`) instead of `class-validator`:

```ts
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}
  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    return result.data;
  }
}
```

Applied per-route: `@Body(new ZodValidationPipe(signupSchema)) dto: SignupRequest`, with `SignupRequest = z.infer<typeof signupSchema>` imported from `packages/shared` — the same schema `apps/web`'s signup form resolves against. No parallel DTO class with its own decorators.

The pipe is applied per-route for now rather than wrapped in a `@ZodBody(schema)` param decorator, per `CLAUDE.md` §5's explicit guidance not to build that abstraction until the duplication has actually been felt two or three times — issue #10 introduces exactly two call sites (`signup`, `login`).

## Consequences

- `class-validator` and `class-transformer` are not dependencies of `apps/api`. Every future controller validates the same way: a Zod schema from `packages/shared`, wrapped in `new ZodValidationPipe(schema)`.
- Nest's built-in global `ValidationPipe` (the `class-validator` one) is never registered — a contributor reaching for `@IsString()` on a new DTO is working against the grain of this codebase, not with it.
- Validation error responses are a flat `message: string[]` rather than `class-validator`'s nested constraint-object shape; any frontend error-surfacing code should assume the flat-array shape.
- If per-route repetition of `new ZodValidationPipe(schema)` becomes noticeably duplicative once more than two or three routes use it, a `@ZodBody(schema)` decorator is the pre-agreed next step (see `CLAUDE.md` §5) rather than a new decision.

## Alternatives considered

- **Nest's default `class-validator` + `class-transformer`.** Rejected: would create a second, hand-maintained copy of every validation rule already expressed once in `packages/shared`'s Zod schemas, reintroducing the divergence risk `ADR-0012` exists to prevent — and duplicating it for every future request shape, not just `schoolYear`.
- **A generic `@ZodBody(schema)` decorator from the start.** Rejected for now: only two call sites exist in this ticket. Building the abstraction before the duplication has actually been felt three times over would be speculative, per `CLAUDE.md` §5.
