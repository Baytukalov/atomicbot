import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (result.error) {
    throw new Error(`Failed to execute ${cmd}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with exit code ${result.status ?? "?"}`);
  }
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

export function rmrfStrict(p) {
  if (!fs.existsSync(p)) {
    return;
  }
  fs.rmSync(p, { recursive: true, force: true });
  if (fs.existsSync(p)) {
    throw new Error(`[electron-desktop] Failed to remove deploy dir: ${p}`);
  }
}

export function tryRemove(p) {
  try {
    fs.lstatSync(p);
  } catch {
    return false;
  }
  fs.rmSync(p, { recursive: true, force: true });
  return true;
}

export function packageNameFromSpecifier(specifier) {
  if (
    !specifier ||
    specifier.startsWith("node:") ||
    specifier.startsWith(".") ||
    specifier.startsWith("/")
  ) {
    return null;
  }
  const parts = specifier.split("/");
  const pkg = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  if (!/^(@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i.test(pkg)) {
    return null;
  }
  return pkg;
}

export function isPackageCoveredByExternals(pkgName, externals) {
  for (const pattern of externals) {
    if (pattern === pkgName) return true;
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      if (pkgName.startsWith(prefix)) return true;
    }
  }
  return false;
}

export function inferPackageFromEsbuildErrorMessage(message) {
  const text = String(message || "");
  const quoted = [...text.matchAll(/Could not resolve "([^"]+)"/g)];
  for (const m of quoted) {
    const pkg = packageNameFromSpecifier(m[1]);
    if (pkg) return pkg;
  }
  const singleQuoted = [...text.matchAll(/Could not resolve '([^']+)'/g)];
  for (const m of singleQuoted) {
    const pkg = packageNameFromSpecifier(m[1]);
    if (pkg) return pkg;
  }
  return null;
}

export function uniqSortedStrings(list) {
  return [...new Set(list.map((x) => String(x).trim()).filter(Boolean))].sort();
}

export function pnpmEntryPrefixForPackage(pkgName) {
  return pkgName.startsWith("@") ? `${pkgName.replace("/", "+")}@` : `${pkgName}@`;
}

export function collectExternalPackagesFromMetafile(params) {
  const { metafile, nodeBuiltins } = params;
  const out = new Set();
  for (const output of Object.values(metafile.outputs || {})) {
    for (const imp of output.imports || []) {
      if (!imp.external) continue;
      const pkg = packageNameFromSpecifier(imp.path);
      if (!pkg) continue;
      if (nodeBuiltins.has(pkg)) continue;
      out.add(pkg);
    }
  }
  return out;
}

export function scanTopLevelChunkRefs(params) {
  const { jsSource, fileDir, distDir } = params;
  const preserveFiles = new Set();
  const importRe =
    /(?:import|export)\s*[^;]*?\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\brequire\s*\(\s*["']([^"']+)["']\s*\)|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of jsSource.matchAll(importRe)) {
    const dep = m[1] || m[2] || m[3] || m[4];
    if (!dep || !dep.startsWith(".")) continue;
    const abs = path.resolve(fileDir, dep);
    if (path.dirname(abs) === distDir) {
      preserveFiles.add(path.basename(abs));
    }
  }
  return preserveFiles;
}

// Parse non-rebundled dist JavaScript with esbuild so dependency discovery
// relies on a parser instead of regex-only heuristics.
export async function collectDistSubdirPackages(params) {
  const { distDir, esbuild, bundleExternals, nodeBuiltins } = params;
  const packages = new Set();
  const preserveFiles = new Set();
  let analyzedFiles = 0;
  const importRe =
    /(?:import|export)\s*[^;]*?\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\brequire\s*\(\s*["']([^"']+)["']\s*\)|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  const subdirs = fs.readdirSync(distDir, { withFileTypes: true });
  for (const sub of subdirs) {
    if (!sub.isDirectory()) continue;
    if (sub.name === "control-ui") continue;

    const queue = [path.join(distDir, sub.name)];
    while (queue.length > 0) {
      const dir = queue.pop();
      if (!dir) continue;

      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          queue.push(full);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".js")) continue;

        const src = fs.readFileSync(full, "utf8");
        // Keep references to dist-level shared chunks (e.g. paths-*.js) so cleanup
        // does not delete files still imported by dist subdirectories.
        for (const keep of scanTopLevelChunkRefs({ jsSource: src, fileDir: dir, distDir })) {
          preserveFiles.add(keep);
        }
        // Keep package deps used by non-rebundled dist subdirs (plugin-sdk, bundled hooks).
        for (const m of src.matchAll(importRe)) {
          const dep = m[1] || m[2] || m[3] || m[4];
          const pkg = packageNameFromSpecifier(dep);
          if (pkg && !nodeBuiltins.has(pkg)) {
            packages.add(pkg);
          }
        }

        // write:false lets us parse + build the graph without modifying files.
        // Vendored node_modules inside extensions may contain legacy builds
        // with unresolvable deps (e.g. regenerator-runtime) — skip on failure.
        try {
          const analyzed = await esbuild.build({
            entryPoints: [full],
            bundle: true,
            write: false,
            metafile: true,
            platform: "node",
            format: "esm",
            logLevel: "silent",
            external: [...bundleExternals, "node:*", ...nodeBuiltins],
          });
          analyzedFiles++;
          const found = collectExternalPackagesFromMetafile({
            metafile: analyzed.metafile,
            nodeBuiltins,
          });
          for (const p of found) {
            packages.add(p);
          }
        } catch {
          // Non-runtime files (legacy builds, build configs) that fail — skip.
        }
      }
    }
  }

  // Transitively scan preserved dist-level chunks: each preserved file may
  // itself import other dist-level chunks that also need to survive cleanup.
  const scanned = new Set();
  let frontier = [...preserveFiles];
  while (frontier.length > 0) {
    const next = [];
    for (const fileName of frontier) {
      if (scanned.has(fileName)) continue;
      scanned.add(fileName);
      const filePath = path.join(distDir, fileName);
      let src;
      try {
        src = fs.readFileSync(filePath, "utf8");
      } catch {
        continue;
      }
      for (const keep of scanTopLevelChunkRefs({ jsSource: src, fileDir: distDir, distDir })) {
        if (!preserveFiles.has(keep)) {
          preserveFiles.add(keep);
          next.push(keep);
        }
      }
    }
    frontier = next;
  }

  return { packages, preserveFiles, analyzedFiles };
}
