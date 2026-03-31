import type { GatewayRequest } from "./chat/chatSlice";

export async function resetSessionModelSelection(request: GatewayRequest): Promise<void> {
  try {
    const result = await request<{
      sessions?: Array<{
        key?: string;
        modelOverride?: string | null;
        model?: string | null;
        modelProvider?: string | null;
      }>;
    }>("sessions.list", { includeGlobal: false, includeUnknown: false });
    const sessions = result.sessions ?? [];
    const dirtySessions = sessions.filter(
      (session): session is { key: string } =>
        typeof session.key === "string" &&
        Boolean(session.modelOverride || session.model || session.modelProvider)
    );
    await Promise.all(
      dirtySessions.map((session) => request("sessions.patch", { key: session.key, model: null }))
    );
  } catch {
    // Best effort: new sessions will still use the updated default model.
  }
}
