import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readConsentAccepted, writeConsentAccepted } from "./consent";

describe("readConsentAccepted", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "consent-read-test-"));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns false when file does not exist", () => {
    expect(readConsentAccepted(path.join(tmpDir, "consent.json"))).toBe(false);
  });

  it("returns true when file contains accepted: true", () => {
    const p = path.join(tmpDir, "consent.json");
    fs.writeFileSync(p, JSON.stringify({ accepted: true }));
    expect(readConsentAccepted(p)).toBe(true);
  });

  it("returns false when accepted is false", () => {
    const p = path.join(tmpDir, "consent.json");
    fs.writeFileSync(p, JSON.stringify({ accepted: false }));
    expect(readConsentAccepted(p)).toBe(false);
  });

  it("returns false for malformed JSON", () => {
    const p = path.join(tmpDir, "consent.json");
    fs.writeFileSync(p, "not json");
    expect(readConsentAccepted(p)).toBe(false);
  });

  it("returns false when payload is not an object", () => {
    const p = path.join(tmpDir, "consent.json");
    fs.writeFileSync(p, '"just a string"');
    expect(readConsentAccepted(p)).toBe(false);
  });

  it("returns false for null payload", () => {
    const p = path.join(tmpDir, "consent.json");
    fs.writeFileSync(p, "null");
    expect(readConsentAccepted(p)).toBe(false);
  });
});

describe("writeConsentAccepted", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "consent-write-test-"));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes consent file with accepted: true and timestamp", () => {
    const p = path.join(tmpDir, "consent.json");
    writeConsentAccepted(p);
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
    expect(parsed.accepted).toBe(true);
    expect(typeof parsed.acceptedAt).toBe("string");
  });

  it("creates parent directories if needed", () => {
    const p = path.join(tmpDir, "nested", "dir", "consent.json");
    writeConsentAccepted(p);
    expect(fs.existsSync(p)).toBe(true);
  });

  it("round-trips with readConsentAccepted", () => {
    const p = path.join(tmpDir, "consent.json");
    writeConsentAccepted(p);
    expect(readConsentAccepted(p)).toBe(true);
  });
});
