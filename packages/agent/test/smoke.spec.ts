import { describe, it, expect } from "vitest";
import { AGENT_PACKAGE } from "../src/index.js";
describe("@meridian/agent smoke", () => {
  it("exports the package name", () => {
    expect(AGENT_PACKAGE).toBe("@meridian/agent");
  });
});
