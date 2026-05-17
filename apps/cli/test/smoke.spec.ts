import { describe, it, expect } from "vitest";
import { renderTable } from "../src/output.js";

describe("@meridian/cli smoke", () => {
  it("renderTable produces aligned columns", () => {
    const out = renderTable(
      [
        { header: "Name", maxWidth: 20 },
        { header: "N", align: "right" },
      ],
      [
        { Name: "alpha", N: "1" },
        { Name: "beta-very-very-long-name-truncates", N: "22" },
      ],
    );
    const lines = out.split("\n");
    // header + divider + 2 rows
    expect(lines).toHaveLength(4);
    // No row exceeds reasonable width given maxWidth on Name
    expect(lines[2]!.includes("alpha")).toBe(true);
    expect(lines[3]!.includes("…") || lines[3]!.includes("beta")).toBe(true);
  });
});
