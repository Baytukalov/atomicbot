import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { clearSetupMode, readSetupMode, writeSetupMode } from "./setup-mode-state";

describe("setup-mode-state persistence", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-setup-mode-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("readSetupMode returns null when no file exists", () => {
    expect(readSetupMode(tmpDir)).toBeNull();
  });

  test("writeSetupMode + readSetupMode roundtrip", () => {
    writeSetupMode(tmpDir, "local-model");
    expect(readSetupMode(tmpDir)).toBe("local-model");
  });

  test("writeSetupMode overwrites previous value", () => {
    writeSetupMode(tmpDir, "paid");
    writeSetupMode(tmpDir, "self-managed");
    expect(readSetupMode(tmpDir)).toBe("self-managed");
  });

  test("clearSetupMode removes the persisted marker", () => {
    writeSetupMode(tmpDir, "local-model");
    clearSetupMode(tmpDir);
    expect(readSetupMode(tmpDir)).toBeNull();
  });

  test("readSetupMode returns null for malformed JSON", () => {
    fs.writeFileSync(path.join(tmpDir, "desktop-setup-mode.json"), "not json");
    expect(readSetupMode(tmpDir)).toBeNull();
  });
});
