import { describe, expect, it } from "vitest";
import { deriveSecurityLevel, applySecurityLevel, type ExecApprovalsFile } from "./OtherTab";

describe("deriveSecurityLevel", () => {
  it("returns permissive when security=full and ask=off", () => {
    const file: ExecApprovalsFile = {
      version: 1,
      defaults: { security: "full", ask: "off" },
    };
    expect(deriveSecurityLevel(file)).toBe("permissive");
  });

  it("returns balanced when security=allowlist and ask=on-miss", () => {
    const file: ExecApprovalsFile = {
      version: 1,
      defaults: { security: "allowlist", ask: "on-miss" },
    };
    expect(deriveSecurityLevel(file)).toBe("balanced");
  });

  it("returns balanced when defaults are missing", () => {
    const file: ExecApprovalsFile = { version: 1 };
    expect(deriveSecurityLevel(file)).toBe("balanced");
  });

  it("returns balanced when security=full but ask is not off", () => {
    const file: ExecApprovalsFile = {
      version: 1,
      defaults: { security: "full", ask: "on-miss" },
    };
    expect(deriveSecurityLevel(file)).toBe("balanced");
  });

  it("returns balanced when ask=off but security is not full", () => {
    const file: ExecApprovalsFile = {
      version: 1,
      defaults: { security: "allowlist", ask: "off" },
    };
    expect(deriveSecurityLevel(file)).toBe("balanced");
  });
});

describe("applySecurityLevel", () => {
  const baseFile: ExecApprovalsFile = {
    version: 1,
    defaults: { askFallback: "deny" },
    agents: { main: { allowlist: [{ pattern: "/usr/bin/echo" }] } },
  };

  it("sets permissive: security=full, ask=off", () => {
    const result = applySecurityLevel(baseFile, "permissive");
    expect(result.defaults?.security).toBe("full");
    expect(result.defaults?.ask).toBe("off");
  });

  it("sets balanced: security=allowlist, ask=on-miss, autoAllowSkills=true", () => {
    const result = applySecurityLevel(baseFile, "balanced");
    expect(result.defaults?.security).toBe("allowlist");
    expect(result.defaults?.ask).toBe("on-miss");
    expect(result.defaults?.autoAllowSkills).toBe(true);
  });

  it("preserves existing fields like askFallback and agents", () => {
    const result = applySecurityLevel(baseFile, "permissive");
    expect(result.defaults?.askFallback).toBe("deny");
    expect(result.agents?.main?.allowlist).toEqual([{ pattern: "/usr/bin/echo" }]);
  });

  it("does not mutate the original file", () => {
    const original = { ...baseFile, defaults: { ...baseFile.defaults } };
    applySecurityLevel(original, "permissive");
    expect(original.defaults?.security).toBeUndefined();
    expect(original.defaults?.ask).toBeUndefined();
  });

  it("roundtrips: apply then derive returns same level", () => {
    const permissive = applySecurityLevel(baseFile, "permissive");
    expect(deriveSecurityLevel(permissive)).toBe("permissive");

    const balanced = applySecurityLevel(baseFile, "balanced");
    expect(deriveSecurityLevel(balanced)).toBe("balanced");
  });
});
