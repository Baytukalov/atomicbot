import * as fs from "node:fs";
import * as path from "node:path";

export function readConsentAccepted(consentPath: string): boolean {
  try {
    if (!fs.existsSync(consentPath)) {
      return false;
    }
    const raw = fs.readFileSync(consentPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return false;
    }
    const obj = parsed as { accepted?: unknown };
    return obj.accepted === true;
  } catch (err) {
    console.warn("[main] readConsentAccepted failed:", err);
    return false;
  }
}

export function writeConsentAccepted(consentPath: string): void {
  try {
    fs.mkdirSync(path.dirname(consentPath), { recursive: true });
    const payload = { accepted: true, acceptedAt: new Date().toISOString() };
    fs.writeFileSync(consentPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  } catch (err) {
    console.warn("[main] writeConsentAccepted failed:", err);
  }
}
