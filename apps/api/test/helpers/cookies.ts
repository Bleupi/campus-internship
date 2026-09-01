import type request from "supertest";

// @types/superagent declares every header (including set-cookie) as a plain
// string, but Node's http actually preserves repeated Set-Cookie headers as
// an array at runtime — a known gap in the type declarations.
export function extractSetCookie(response: request.Response): string[] {
  return (response.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
}

export function cookieMap(response: request.Response): Record<string, string> {
  const map: Record<string, string> = {};
  for (const raw of extractSetCookie(response)) {
    const [pair = ""] = raw.split(";");
    const [name = "", value = ""] = pair.split("=");
    map[name] = value;
  }
  return map;
}

export function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export function requireCookie(cookies: Record<string, string>, name: string): string {
  const value = cookies[name];
  if (!value) {
    throw new Error(`Expected cookie "${name}" to be set`);
  }
  return value;
}
