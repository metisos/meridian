import { describe, it, expect } from "vitest";
import { SHARED_PACKAGE } from "../src/index.js";

describe("@meridian/shared smoke", () => {
  it("exports the package name", () => {
    expect(SHARED_PACKAGE).toBe("@meridian/shared");
  });
});
