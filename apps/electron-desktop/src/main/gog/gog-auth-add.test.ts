import { EventEmitter } from "node:events";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runGogAuthAdd } from "./gog";

function createMockChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

const { spawn } = await import("node:child_process");

describe("runGogAuthAdd", () => {
  let tmpDir: string;
  let stateDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "gog-auth-add-"));
    stateDir = path.join(tmpDir, "state");
    await fsp.mkdir(stateDir, { recursive: true });
    vi.mocked(spawn).mockReset();
  });

  afterEach(async () => {
    vi.mocked(spawn).mockReset();
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("removes existing accounts before adding the new one", async () => {
    const children: ReturnType<typeof createMockChild>[] = [];
    vi.mocked(spawn).mockImplementation(() => {
      const child = createMockChild();
      children.push(child);
      return child as never;
    });

    const promise = runGogAuthAdd({
      gogBin: "/usr/bin/gog",
      openclawDir: "/tmp",
      stateDir,
      account: "new@test.com",
      services: "gmail",
      noInput: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    children[0].stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify({ accounts: [{ email: "old@test.com" }, { email: "other@test.com" }] })
      )
    );
    children[0].emit("close", 0);

    await new Promise((resolve) => setTimeout(resolve, 10));
    children[1].emit("close", 0);

    await new Promise((resolve) => setTimeout(resolve, 10));
    children[2].emit("close", 0);

    await new Promise((resolve) => setTimeout(resolve, 10));
    children[3].emit("close", 0);

    const result = await promise;

    expect(result.ok).toBe(true);
    expect(vi.mocked(spawn).mock.calls).toHaveLength(4);
    expect(vi.mocked(spawn).mock.calls[0]?.[1]).toEqual(["auth", "list", "--json", "--no-input"]);
    expect(vi.mocked(spawn).mock.calls[1]?.[1]).toEqual([
      "auth",
      "remove",
      "old@test.com",
      "--force",
      "--no-input",
    ]);
    expect(vi.mocked(spawn).mock.calls[2]?.[1]).toEqual([
      "auth",
      "remove",
      "other@test.com",
      "--force",
      "--no-input",
    ]);
    expect(vi.mocked(spawn).mock.calls[3]?.[1]).toEqual([
      "auth",
      "add",
      "new@test.com",
      "--services",
      "gmail",
      "--no-input",
    ]);
  });

  it("returns an error when cleanup cannot list existing accounts", async () => {
    const children: ReturnType<typeof createMockChild>[] = [];
    vi.mocked(spawn).mockImplementation(() => {
      const child = createMockChild();
      children.push(child);
      return child as never;
    });

    const promise = runGogAuthAdd({
      gogBin: "/usr/bin/gog",
      openclawDir: "/tmp",
      stateDir,
      account: "new@test.com",
      services: "gmail",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    children[0].stderr.emit("data", Buffer.from("list failed"));
    children[0].emit("close", 1);

    const result = await promise;

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("gog auth list failed");
    expect(vi.mocked(spawn).mock.calls).toHaveLength(1);
  });

  it("returns an error when cleanup cannot remove an old account", async () => {
    const children: ReturnType<typeof createMockChild>[] = [];
    vi.mocked(spawn).mockImplementation(() => {
      const child = createMockChild();
      children.push(child);
      return child as never;
    });

    const promise = runGogAuthAdd({
      gogBin: "/usr/bin/gog",
      openclawDir: "/tmp",
      stateDir,
      account: "new@test.com",
      services: "gmail",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    children[0].stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ accounts: [{ email: "old@test.com" }] }))
    );
    children[0].emit("close", 0);

    await new Promise((resolve) => setTimeout(resolve, 10));
    children[1].stderr.emit("data", Buffer.from("permission denied"));
    children[1].emit("close", 1);

    const result = await promise;

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("gog auth remove failed for old@test.com");
    expect(vi.mocked(spawn).mock.calls).toHaveLength(2);
  });
});
