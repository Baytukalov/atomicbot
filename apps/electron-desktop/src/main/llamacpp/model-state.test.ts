import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, test, expect, beforeEach, afterEach } from "vitest";

import { readActiveModelId, writeActiveModelId } from "./model-state";

describe("model-state persistence", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llamacpp-model-state-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("readActiveModelId returns null when no file exists", () => {
    expect(readActiveModelId(tmpDir)).toBeNull();
  });

  test("writeActiveModelId + readActiveModelId roundtrip", () => {
    writeActiveModelId(tmpDir, "mistral-7b");
    expect(readActiveModelId(tmpDir)).toBe("mistral-7b");
  });

  test("writeActiveModelId overwrites previous value", () => {
    writeActiveModelId(tmpDir, "llama-3.2-3b");
    writeActiveModelId(tmpDir, "qwen-3.5-4b");
    expect(readActiveModelId(tmpDir)).toBe("qwen-3.5-4b");
  });

  test("readActiveModelId returns null for malformed JSON", () => {
    fs.writeFileSync(path.join(tmpDir, "llamacpp-active-model.json"), "not json");
    expect(readActiveModelId(tmpDir)).toBeNull();
  });
});
