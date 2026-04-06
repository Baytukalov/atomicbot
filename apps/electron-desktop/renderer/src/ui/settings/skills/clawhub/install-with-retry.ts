type RpcLike = {
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
};

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1_000;

const NON_RETRYABLE_RE = /not found|invalid.*slug|no installable version|missing SKILL\.md/i;

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as Record<string, unknown>).message);
  }
  return String(err);
}

export async function installSkillWithRetry(
  gw: RpcLike,
  slug: string,
): Promise<void> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await gw.request("skills.install", {
        source: "clawhub",
        slug,
        force: attempt > 0,
      });
      return;
    } catch (err) {
      lastErr = err;
      const msg = extractErrorMessage(err);
      if (NON_RETRYABLE_RE.test(msg)) {
        throw err;
      }
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * (attempt + 1)));
      }
    }
  }

  throw lastErr;
}
