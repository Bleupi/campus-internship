import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom doesn't implement matchMedia; MUI's useMediaQuery calls it on every
// render, so any component using a responsive breakpoint crashes in tests
// without this. Defaults to "not matching" (desktop) unless a test overrides it
// via setMatchMedia.
export function setMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

setMatchMedia(false);

// jsdom doesn't implement the Blob object-URL APIs either (issue #43's
// certificate viewer uses URL.createObjectURL/revokeObjectURL) — stubbed
// globally for the same reason as matchMedia above.
URL.createObjectURL = vi.fn(() => "blob:mock-url");
URL.revokeObjectURL = vi.fn();
