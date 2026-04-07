import { describe, it, expect } from "vitest";
import { stripMetadata } from "./message-strip";

describe("stripMetadata", () => {
  it("returns plain text unchanged", () => {
    expect(stripMetadata("hello world")).toBe("hello world");
  });

  it("strips date headers", () => {
    expect(stripMetadata("[2025-01-15 09:30] hello")).toBe("hello");
  });

  it("strips date headers with day name", () => {
    expect(stripMetadata("[Mon 2025-01-15 09:30] hello")).toBe("hello");
  });

  it("strips media attachment markers", () => {
    expect(stripMetadata("msg [media attached: /path/img.png (image/png)] end")).toBe("msg  end");
  });

  it("strips legacy attachment markers", () => {
    expect(stripMetadata("msg [Attached: file.txt (text/plain)] end")).toBe("msg  end");
  });

  it("strips message_id hints", () => {
    expect(stripMetadata("hello\n  [message_id: abc-123]  \nworld")).toBe("hello\n\nworld");
  });

  it("strips think blocks", () => {
    expect(stripMetadata("<think>reasoning</think>answer")).toBe("answer");
  });

  it("strips unclosed think blocks (streaming)", () => {
    expect(stripMetadata("<think>partial reasoning")).toBe("");
  });

  it("strips file tags", () => {
    expect(stripMetadata('before <file path="/a.txt">content</file> after')).toBe("before  after");
  });

  it("strips bootstrap truncation warning block", () => {
    const input = [
      "привет",
      "",
      "[Bootstrap truncation warning] Some workspace bootstrap files were truncated before injection. Treat Project Context as partial and read the relevant files directly if details seem missing.",
      "",
      "AGENTS.md: 7809 raw -> 4608 injected (~41% removed; max/file).",
      "If unintentional, raise agents.defaults.bootstrapMaxChars and/or agents.defaults.bootstrapTotalMaxChars.",
    ].join("\n");
    expect(stripMetadata(input)).toBe("привет\n\n");
  });

  it("strips bootstrap truncation warning with text after block", () => {
    const input =
      "hello\n[Bootstrap truncation warning]\nSome text\n- file: 100 raw -> 50 injected\nIf unintentional, raise agents.defaults.bootstrapMaxChars and/or agents.defaults.bootstrapTotalMaxChars.\nbye";
    expect(stripMetadata(input)).toBe("hello\n\nbye");
  });

  it("strips truncated bootstrap warning (no bootstrapTotalMaxChars anchor)", () => {
    const input = "привет [Bootstrap truncation warning] Some workspace bootstrap files were truncated";
    expect(stripMetadata(input)).toBe("привет ");
  });

  it("handles empty string", () => {
    expect(stripMetadata("")).toBe("");
  });
});
