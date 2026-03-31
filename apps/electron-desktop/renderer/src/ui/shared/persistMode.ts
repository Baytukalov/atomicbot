/**
 * Persists the desktop mode (paid vs self-managed) in localStorage.
 * Lightweight, synchronous read — no gateway dependency.
 */
import { persistMode } from "@store/slices/auth/authSlice";
import type { SetupMode } from "@store/slices/auth/authSlice";

const LS_KEY = "openclaw-desktop-mode";

export function persistDesktopMode(mode: SetupMode): void {
  persistMode(mode);
}

export function readDesktopMode(): SetupMode | null {
  try {
    const val = localStorage.getItem(LS_KEY);
    if (val === "paid" || val === "self-managed" || val === "local-model") {
      return val;
    }
    return null;
  } catch {
    return null;
  }
}
