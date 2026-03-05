/**
 * Lightweight API key validation against each provider's real endpoint.
 * Makes a single cheap request (usually GET /models) and inspects the HTTP status.
 * 200 → valid, 401/403 → invalid, anything else → treated as a network/server error.
 *
 * Some providers (e.g. NVIDIA) need a POST with an empty body: auth is checked
 * before body validation, so 401 = bad key, 422 = key valid but body invalid.
 */

const VALIDATION_TIMEOUT_MS = 10_000;

type ProviderValidationSpec = {
  url: string;
  headers: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
  /** Extra HTTP statuses (besides 2xx) that prove the key is valid. */
  validStatuses?: number[];
  /**
   * When set, validation is header-based: the key is valid if this response
   * header is present (useful for public endpoints that add auth-only headers).
   */
  validResponseHeader?: string;
};

function buildValidationSpec(provider: string, apiKey: string): ProviderValidationSpec | null {
  switch (provider) {
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/models",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      };
    case "openai":
      return {
        url: "https://api.openai.com/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
      };
    case "google":
      return {
        url: `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`,
        headers: {},
      };
    case "openrouter":
      return {
        url: "https://openrouter.ai/api/v1/auth/key",
        headers: { Authorization: `Bearer ${apiKey}` },
      };
    case "zai":
      return {
        url: "https://open.bigmodel.cn/api/paas/v4/models",
        headers: { Authorization: `Bearer ${apiKey}` },
      };
    case "minimax":
      return {
        url: "https://api.minimax.chat/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
      };
    case "xai":
      return {
        url: "https://api.x.ai/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
      };
    case "moonshot":
      return {
        url: "https://api.moonshot.ai/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
      };
    case "nvidia":
      return {
        url: "https://api.ngc.nvidia.com/v2/orgs",
        headers: { Authorization: `Bearer ${apiKey}` },
      };
    case "venice":
      return {
        url: "https://api.venice.ai/api/v1/chat/completions",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ model: "llama-3.3-70b", messages: [] }),
        validStatuses: [400, 422],
      };
    default:
      return null;
  }
}

export async function validateProviderApiKey(
  provider: string,
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  const normalized = provider.trim().toLowerCase();
  const key = apiKey.trim();

  if (!normalized) {
    return { valid: false, error: "Provider is required." };
  }
  if (!key) {
    return { valid: false, error: "API key is required." };
  }

  const spec = buildValidationSpec(normalized, key);
  if (!spec) {
    // Unknown provider — skip validation, allow saving
    return { valid: true };
  }

  try {
    const res = await fetch(spec.url, {
      method: spec.method ?? "GET",
      headers: spec.headers,
      body: spec.body,
      signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
    });

    if (spec.validResponseHeader) {
      const hasHeader = res.headers.get(spec.validResponseHeader) !== null;
      return hasHeader
        ? { valid: true }
        : { valid: false, error: "Invalid API key. Please check and try again." };
    }

    if (res.ok || spec.validStatuses?.includes(res.status)) {
      return { valid: true };
    }

    if (res.status === 401 || res.status === 403) {
      return { valid: false, error: "Invalid API key. Please check and try again." };
    }

    // Other HTTP errors (429, 500, etc.) — report but don't block
    return {
      valid: false,
      error: `Provider returned HTTP ${res.status}. The key may be valid but the service is temporarily unavailable.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("TimeoutError") || message.includes("abort")) {
      return { valid: false, error: "Validation timed out. Check your network connection." };
    }
    return { valid: false, error: `Could not reach provider: ${message}` };
  }
}
