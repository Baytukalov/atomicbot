---
name: update-openclaw-bundle
description: Update and maintain the Electron desktop OpenClaw bundle script (prepare-openclaw-bundle.mjs). Use when openclaw core dependencies change, new native/CJS packages are added, esbuild bundling breaks, or the bundle size grows unexpectedly.
---

# Updating prepare-openclaw-bundle.mjs

This skill guides you through updating the bundle preparation script at
`apps/electron-desktop/scripts/prepare-openclaw-bundle.mjs` after OpenClaw
core dependency changes.

## Architecture Overview

The script builds a self-contained OpenClaw bundle for the Electron desktop app:

1. **Build** — `pnpm build` + `pnpm ui:build`
2. **Deploy** — `pnpm deploy` copies production deps to `vendor/openclaw/`
3. **Hoist** — lifts `.pnpm/node_modules/` to root (Windows NSIS compat)
4. **Prune** — removes heavy unused packages (node-llama-cpp, koffi, typescript)
5. **Strip** — removes docs/tests/typedefs from node_modules
6. **Bundle entry.js** — esbuild inlines most deps into a single file using adaptive externals fallback
7. **Analyze dist/ subdirs** — parser-based esbuild graph pass discovers package usage and top-level chunk references
8. **Tree-shake node_modules** — removes `.pnpm` entries not reachable from externals
9. **Bundle extensions** — each extension becomes a single file (skipped in safe mode)
10. **Verify** — post-bundle runtime checks ensure the bundle is executable and critical packages resolve

Key design: only external packages remain in node_modules. External resolution is now:

- manual policy (`ESBUILD_EXTERNALS_POLICY`)
- generated list (`openclaw-bundle-generated-externals.json`)
- adaptive externals learned during bundling

## Source of Truth

### 1. Externals policy + generated list

**Policy location:** `apps/electron-desktop/scripts/lib/openclaw-bundle-config.mjs`  
**Generated location:** `apps/electron-desktop/scripts/lib/openclaw-bundle-generated-externals.json`

A package must be external if it matches any of:

- Contains native `.node` binaries (e.g. `sharp`, `sqlite3`, `node-pty`)
- Uses dynamic `require()` that breaks when bundled (e.g. `yaml`, `grammy`, `jiti`)
- Has complex module structure esbuild can't handle (e.g. `express`, `zod`)

Use policy for stable/manual intent.
Use generated for auto-learned externals from real build failures.

### 2. PRUNE_PREFIXES / PRUNE_LINK_NAMES / PRUNE_SCOPED_NAMES

**Location:** `apps/electron-desktop/scripts/lib/openclaw-bundle-config.mjs`
**Purpose:** Remove large unused packages before bundling.

Only prune packages that are optional peerDeps or dev-only tools.

### 3. NODE_BUILTINS

**Location:** `apps/electron-desktop/scripts/lib/openclaw-bundle-config.mjs`
**Purpose:** Node.js built-in modules. Update only on Node major version change.

### 4. STRIP\_\* lists

**Location:** `apps/electron-desktop/scripts/lib/openclaw-bundle-config.mjs`
**Purpose:** Remove docs/tests/configs from node_modules. Almost never needs updating.

### 5. ALWAYS_KEEP_PACKAGES / CRITICAL_RUNTIME_PACKAGES / SMOKE_COMMANDS

**Location:** `apps/electron-desktop/scripts/lib/openclaw-bundle-config.mjs`  
**Purpose:** Guardrails for runtime safety after aggressive pruning/bundling.

## Commands

- Prepare bundle (default):  
  `npm run prepare:openclaw`
- Prepare bundle in strict CI mode (fails on adaptive externals):  
  `npm run prepare:openclaw:ci`
- Verify already prepared bundle:  
  `npm run verify:openclaw-bundle`
- Refresh generated externals file from real build behavior:  
  `npm run refresh:openclaw-externals`

## Environment Flags

- `OPENCLAW_BUNDLE_SAFE_MODE=1`  
  Skip aggressive prune and extension rebundling.
- `OPENCLAW_BUNDLE_SKIP_VERIFY=1`  
  Skip final runtime verification.
- `OPENCLAW_BUNDLE_WRITE_GENERATED_EXTERNALS=1`  
  Persist adaptive externals to generated JSON.
- `OPENCLAW_BUNDLE_STRICT_EXTERNALS=1`  
  Fail if adaptive externals were required (used in CI).

## Diagnosis Workflows

### Case A: esbuild fails while bundling entry.js

1. Check whether adaptive externals were logged.
2. Run `npm run refresh:openclaw-externals`.
3. Re-run `npm run prepare:openclaw:ci`.
4. If still failing, add a stable wildcard or package to policy.

### Case B: strict CI fails with adaptive externals

1. Run `npm run refresh:openclaw-externals`.
2. Commit `openclaw-bundle-generated-externals.json`.
3. Re-run CI mode.

### Case C: app crashes with "Cannot find module X"

1. Check generated externals and policy coverage for `X`.
2. If missing, refresh generated externals.
3. If recurrent, promote `X` to policy.
4. Verify with `npm run verify:openclaw-bundle`.

### Case D: bundle size grows unexpectedly

1. Audit heavy entries under `.pnpm`.
2. Confirm the package is truly optional before adding to `PRUNE_*`.
3. Avoid pruning runtime-critical packages.
4. Re-run verification.

## Important Notes

- Do NOT modify files outside `apps/electron-desktop/`
- The script is idempotent — safe to re-run
- Keep policy small and intentional; generated list handles drift
- Prefer generated refresh over manual list edits when possible
- When manual changes are required, document why the package must stay external
