/**
 * Persists the desktop mode (paid vs self-managed) in localStorage.
 * Lightweight, synchronous read — no gateway dependency.
 */
import type { SetupMode } from "@store/slices/auth/authSlice";

const LS_KEY = "openclaw-desktop-mode";

export function persistDesktopMode(mode: SetupMode): void {
  try {
    localStorage.setItem(LS_KEY, mode);
  } catch {
    // localStorage unavailable — best effort
  }
}

export function readDesktopMode(): SetupMode | null {
  try {
    const val = localStorage.getItem(LS_KEY);
    if (val === "paid" || val === "self-managed") {
      return val;
    }
    return null;
  } catch {
    return null;
  }
}
