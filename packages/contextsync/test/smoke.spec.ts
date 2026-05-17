import { describe, it, expect } from "vitest";
import { CONTEXTSYNC_PACKAGE } from "../src/index.js";

describe("@meridian/contextsync smoke", () => {
  it("exports the package name", () => {
    expect(CONTEXTSYNC_PACKAGE).toBe("@meridian/contextsync");
  });
});
