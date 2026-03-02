import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

import * as fs from "node:fs";
import { readSelectedWhisperModel, writeSelectedWhisperModel } from "./model-state";

describe("readSelectedWhisperModel", () => {
  beforeEach(() => {
    vi.mocked(fs.readFileSync).mockReset();
  });

  it("returns default model when file does not exist", () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(readSelectedWhisperModel("/state")).toBe("small");
  });

  it("returns 'openai' when file contains 'openai'", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("openai\n");
    expect(readSelectedWhisperModel("/state")).toBe("openai");
  });

  it("returns 'small' when file contains 'small'", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("small");
    expect(readSelectedWhisperModel("/state")).toBe("small");
  });

  it("returns 'large-v3-turbo-q8' when file contains that value", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("large-v3-turbo-q8");
    expect(readSelectedWhisperModel("/state")).toBe("large-v3-turbo-q8");
  });

  it("returns 'large-v3-turbo' when file contains that value", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("large-v3-turbo");
    expect(readSelectedWhisperModel("/state")).toBe("large-v3-turbo");
  });

  it("returns default model for unrecognized values", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("unknown-model");
    expect(readSelectedWhisperModel("/state")).toBe("small");
  });

  it("trims whitespace from file content", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("  openai  \n");
    expect(readSelectedWhisperModel("/state")).toBe("openai");
  });
});

describe("writeSelectedWhisperModel", () => {
  beforeEach(() => {
    vi.mocked(fs.writeFileSync).mockReset();
  });

  it("writes model id to the correct path", () => {
    writeSelectedWhisperModel("/state", "large-v3-turbo");
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("whisper-model-id"),
      "large-v3-turbo",
      "utf-8"
    );
  });

  it("writes to stateDir/whisper-model-id", () => {
    writeSelectedWhisperModel("/my/state/dir", "openai");
    const writtenPath = vi.mocked(fs.writeFileSync).mock.calls[0]![0] as string;
    expect(writtenPath).toMatch(/\/my\/state\/dir[/\\]whisper-model-id$/);
  });
});
