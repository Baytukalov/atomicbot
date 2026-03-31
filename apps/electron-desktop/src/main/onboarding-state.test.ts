import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { clearOnboardedState, readOnboardedState, writeOnboardedState } from "./onboarding-state";

describe("onboarding-state persistence", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-onboarding-state-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("readOnboardedState returns false when no file exists", () => {
    expect(readOnboardedState(tmpDir)).toBe(false);
  });

  test("writeOnboardedState + readOnboardedState roundtrip", () => {
    writeOnboardedState(tmpDir, true);
    expect(readOnboardedState(tmpDir)).toBe(true);
  });

  test("writeOnboardedState overwrites previous value", () => {
    writeOnboardedState(tmpDir, true);
    writeOnboardedState(tmpDir, false);
    expect(readOnboardedState(tmpDir)).toBe(false);
  });

  test("clearOnboardedState removes the persisted marker", () => {
    writeOnboardedState(tmpDir, true);
    clearOnboardedState(tmpDir);
    expect(readOnboardedState(tmpDir)).toBe(false);
  });

  test("readOnboardedState returns false for malformed JSON", () => {
    fs.writeFileSync(path.join(tmpDir, "desktop-onboarding-state.json"), "not json");
    expect(readOnboardedState(tmpDir)).toBe(false);
  });
});
