import type { PaidBackup, PersistedAuthToken, SelfManagedBackup, SetupMode } from "./auth-types";

const MODE_LS_KEY = "openclaw-desktop-mode";
const AUTH_TOKEN_LS_KEY = "openclaw-auth-token";
const BACKUP_LS_KEY = "openclaw-self-managed-backup";
const PAID_BACKUP_LS_KEY = "openclaw-paid-backup";

export function persistMode(mode: SetupMode): void {
  try {
    localStorage.setItem(MODE_LS_KEY, mode);
  } catch {
    // best effort
  }
}

export function readPersistedMode(): SetupMode | null {
  try {
    const val = localStorage.getItem(MODE_LS_KEY);
    if (val === "paid" || val === "self-managed") return val;
    return null;
  } catch {
    return null;
  }
}

export function persistAuthToken(data: PersistedAuthToken): void {
  try {
    localStorage.setItem(AUTH_TOKEN_LS_KEY, JSON.stringify(data));
  } catch {
    // best effort
  }
}

export function readPersistedAuthToken(): PersistedAuthToken | null {
  try {
    const raw = localStorage.getItem(AUTH_TOKEN_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed?.jwt === "string") return parsed as unknown as PersistedAuthToken;
    return null;
  } catch {
    return null;
  }
}

export function clearPersistedAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_LS_KEY);
  } catch {
    // ignore
  }
}

export function readBackup(): SelfManagedBackup | null {
  try {
    const raw = localStorage.getItem(BACKUP_LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SelfManagedBackup;
  } catch {
    return null;
  }
}

export function saveBackup(backup: SelfManagedBackup): void {
  try {
    localStorage.setItem(BACKUP_LS_KEY, JSON.stringify(backup));
  } catch (err) {
    console.warn("[authSlice] Failed to save backup:", err);
  }
}

export function clearBackup(): void {
  try {
    localStorage.removeItem(BACKUP_LS_KEY);
  } catch {
    // ignore
  }
}

export function readPaidBackup(): PaidBackup | null {
  try {
    const raw = localStorage.getItem(PAID_BACKUP_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const token = parsed.authToken as Record<string, unknown> | undefined;
    if (!token || typeof token.jwt !== "string") return null;
    return parsed as unknown as PaidBackup;
  } catch {
    return null;
  }
}

export function savePaidBackup(backup: PaidBackup): void {
  try {
    localStorage.setItem(PAID_BACKUP_LS_KEY, JSON.stringify(backup));
  } catch (err) {
    console.warn("[authSlice] Failed to save paid backup:", err);
  }
}

export function clearPaidBackup(): void {
  try {
    localStorage.removeItem(PAID_BACKUP_LS_KEY);
  } catch {
    // ignore
  }
}
