import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "./zod-validation.pipe";

describe("ZodValidationPipe", () => {
  const schema = z.object({
    email: z.string().email(),
    age: z.number().int().positive(),
  });

  it("returns the parsed value when it satisfies the schema", () => {
    const pipe = new ZodValidationPipe(schema);
    const value = { email: "a@b.com", age: 21 };

    expect(pipe.transform(value)).toEqual(value);
  });

  it("throws a BadRequestException when the value fails validation", () => {
    const pipe = new ZodValidationPipe(schema);

    expect(() => pipe.transform({ email: "not-an-email", age: -1 })).toThrow(BadRequestException);
  });

  it("formats the exception with one message per failing field", () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform({ email: "not-an-email", age: -1 });
      throw new Error("expected pipe.transform to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        message: string[];
      };
      expect(response.message).toHaveLength(2);
      expect(response.message.some((m) => m.includes("email"))).toBe(true);
      expect(response.message.some((m) => m.includes("age"))).toBe(true);
    }
  });
});
