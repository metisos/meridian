import { describe, it, expect } from "vitest";
import { parseCtxURI, buildCtxURI, matchPattern, compilePattern } from "../src/uri.js";

describe("URI parse/build (spec §1)", () => {
  it("parses ctx://org/domain/id", () => {
    expect(parseCtxURI("ctx://meridian/splunk-events/evt_001")).toEqual({
      org: "meridian",
      domain: "splunk-events",
      id: "evt_001",
    });
  });

  it("parses ids with subpaths", () => {
    expect(parseCtxURI("ctx://meridian/entities/server/prod-db-03")).toEqual({
      org: "meridian",
      domain: "entities",
      id: "server/prod-db-03",
    });
  });

  it("parses ctx://org/domain (no id) — rare but representable", () => {
    expect(parseCtxURI("ctx://meridian/runbooks")).toEqual({
      org: "meridian",
      domain: "runbooks",
      id: undefined,
    });
  });

  it("throws on malformed URIs", () => {
    expect(() => parseCtxURI("http://x")).toThrow();
    expect(() => parseCtxURI("ctx://")).toThrow();
    expect(() => parseCtxURI("ctx://only-org")).toThrow();
  });

  it("round-trips through buildCtxURI", () => {
    const uri = "ctx://meridian/investigations/inv_20260520_001";
    const parts = parseCtxURI(uri);
    expect(buildCtxURI(parts)).toBe(uri);
  });

  it("rejects slashes in org or domain", () => {
    expect(() => buildCtxURI({ org: "a/b", domain: "c", id: "x" })).toThrow();
    expect(() => buildCtxURI({ org: "a", domain: "b/c", id: "x" })).toThrow();
  });
});

describe("Pattern matching (spec §1)", () => {
  it("bare * matches everything", () => {
    expect(matchPattern("ctx://meridian/x/y", "*")).toBe(true);
    expect(matchPattern("anything", "*")).toBe(true);
  });

  it("* matches within a single segment, not across slashes", () => {
    const p = "ctx://acme/compliance/*";
    expect(matchPattern("ctx://acme/compliance/policy", p)).toBe(true);
    expect(matchPattern("ctx://acme/compliance/sub/policy", p)).toBe(false);
    expect(matchPattern("ctx://acme/other/policy", p)).toBe(false);
  });

  it("** matches across slashes", () => {
    expect(matchPattern("ctx://acme/compliance/sub/policy", "ctx://acme/**")).toBe(true);
    expect(matchPattern("ctx://acme/x/y/z", "ctx://acme/**")).toBe(true);
    expect(matchPattern("ctx://other/x", "ctx://acme/**")).toBe(false);
  });

  it("escapes regex metacharacters in fixed parts", () => {
    expect(matchPattern("ctx://a.b/c/d", "ctx://a.b/c/*")).toBe(true);
    expect(matchPattern("ctx://aXb/c/d", "ctx://a.b/c/*")).toBe(false);
  });

  it("compilePattern returns a usable regex", () => {
    const re = compilePattern("ctx://meridian/splunk-events/*");
    expect(re.test("ctx://meridian/splunk-events/evt_001")).toBe(true);
    expect(re.test("ctx://meridian/splunk-events/sub/evt_001")).toBe(false);
  });
});
