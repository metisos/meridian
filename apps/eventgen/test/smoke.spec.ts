import { describe, it, expect } from "vitest";
import { EVENTGEN_PACKAGE } from "../src/index.js";

describe("@meridian/eventgen smoke", () => {
  it("exports the package name", () => {
    expect(EVENTGEN_PACKAGE).toBe("@meridian/eventgen");
  });
});
