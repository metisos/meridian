import { describe, it, expect } from "vitest";
import { USC_PACKAGE } from "../src/index.js";

describe("@meridian/usc smoke", () => {
  it("exports the package name", () => {
    expect(USC_PACKAGE).toBe("@meridian/usc");
  });
});
