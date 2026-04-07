import {
  definePluginEntry,
  type OpenClawPluginApi,
  type AnyAgentTool,
  type ProviderNormalizeToolSchemasContext,
} from "openclaw/plugin-sdk/plugin-entry";

const PROVIDER_ID = "llamacpp";

const CONDENSED_TOOL_DESCRIPTIONS: Record<string, string> = {
  cron: "Schedule, list, patch, delete, or run cron jobs. Actions: create, list, get, patch, delete, run, enable, disable, logs.",
  message:
    "Send messages or perform channel actions (react, pin, edit, delete, typing). Use for proactive sends.",
  browser: "Navigate, screenshot, click, type, scroll, and interact with web pages.",
  nodes: "List, inspect, or manage gateway nodes.",
  sessions_spawn: "Spawn a new sub-agent session with a prompt.",
  process: "List or kill running processes.",
  exec: "Execute a shell command. Returns stdout/stderr. Use for system commands, scripts, installs.",
  edit: "Edit a file by searching for a string and replacing it, or create a new file.",
  gateway: "Control the gateway: status, start, stop, restart, or run management actions.",
};

function stripSchemaDescriptions(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(stripSchemaDescriptions);
  const obj = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "description") continue;
    if (k === "properties" && v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [
          pk,
          stripSchemaDescriptions(pv),
        ]),
      );
      continue;
    }
    if (
      (k === "items" || k === "anyOf" || k === "oneOf" || k === "allOf") &&
      typeof v === "object"
    ) {
      out[k] = Array.isArray(v) ? v.map(stripSchemaDescriptions) : stripSchemaDescriptions(v);
      continue;
    }
    out[k] = typeof v === "object" && v !== null ? stripSchemaDescriptions(v) : v;
  }
  return out;
}

function condenseLlamacppToolSchemas(ctx: ProviderNormalizeToolSchemasContext): AnyAgentTool[] {
  return ctx.tools.map((tool) => {
    const condensedDesc = CONDENSED_TOOL_DESCRIPTIONS[tool.name];
    const desc = condensedDesc ?? tool.description;
    const params = tool.parameters ? stripSchemaDescriptions(tool.parameters) : tool.parameters;
    return { ...tool, description: desc, parameters: params } as AnyAgentTool;
  });
}

const CONDENSED_OVERRIDES = {
  tooling: [
    "## Tooling",
    "Structured tool definitions are the source of truth. Call tools exactly as listed (case-sensitive).",
    "If a tool is in the definitions, it is available unless a tool call reports a restriction.",
    "TOOLS.md is user guidance only, not tool availability.",
    "Use cron for future/recurring tasks; exec/process for immediate work only. Do not emulate scheduling with sleep/poll loops.",
    "Start long-running work once; rely on completion wake or process to confirm.",
    "For multi-step work, keep update_plan current with one in_progress step; skip for simple tasks.",
    "Spawn sub-agents for complex tasks; do not poll subagents/sessions in a loop.",
  ].join("\n"),
  tool_call_style: [
    "## Tool Call Style",
    "Call tools directly without narration for routine actions. Keep narration brief when used.",
    "Narrate only for multi-step, complex, or sensitive work.",
    "Use first-class tools over CLI equivalents.",
    "Show full commands/scripts exactly for approval; treat allow-once as single-command.",
    "Never run /approve via exec; it is a user-facing command only.",
  ].join("\n"),
  execution_bias: [
    "## Execution Bias",
    "Start work immediately when actionable. Use tools first, not plans.",
    "Commentary-only turns are incomplete when tools are available and the next action is clear.",
    "Send a short progress update for longer tasks.",
  ].join("\n"),
  safety: [
    "## Safety",
    "No independent goals: avoid self-preservation, replication, resource acquisition, power-seeking, or long-term plans beyond the user's request.",
    "Prioritize safety and human oversight; pause and ask if instructions conflict; comply with stop/pause/audit requests.",
    "Do not manipulate access, bypass safeguards, copy yourself, or change system prompts/safety rules unless explicitly requested.",
  ].join("\n"),
  cli_reference: [
    "## OpenClaw CLI",
    "Subcommands only; do not invent commands.",
    "Gateway: openclaw gateway status|start|stop|restart.",
    "If unsure, ask user to run `openclaw help`.",
  ].join("\n"),
  self_update: [
    "## OpenClaw Self-Update",
    "Only update when user explicitly asks; if not explicit, ask first.",
    "Use config.schema.lookup with a specific dot path before changes; avoid guessing field names.",
    "Actions: config.schema.lookup, config.get, config.apply (write + restart), config.patch (merge partial), update.run.",
    "After restart, OpenClaw pings the last session automatically.",
  ].join("\n"),
  docs: [
    "## Documentation",
    "Mirror: https://docs.openclaw.ai | Source: https://github.com/openclaw/openclaw",
    "Community: https://discord.com/invite/clawd | Skills: https://clawhub.ai",
    "Consult local docs first for OpenClaw questions.",
    "When diagnosing issues, run `openclaw status` yourself when possible; ask user only if sandboxed.",
  ].join("\n"),
  reply_tags: [
    "## Reply Tags",
    "Use [[reply_to_current]] as the very first token (no leading text) to reply to the triggering message.",
    "Use [[reply_to:<id>]] only when an id was explicitly provided. Prefer [[reply_to_current]].",
    "Tags are stripped before sending; support depends on the channel.",
  ].join("\n"),
  messaging: [
    "## Messaging",
    "Current session replies route to source channel automatically.",
    "Cross-session: sessions_send(sessionKey, message). Sub-agents: subagents(action=list|steer|kill).",
    "Completion events: rewrite in your assistant voice; do not forward raw metadata or default to silent token.",
    "Use message tool for proactive sends/channel actions. After message tool delivers reply, respond with silent token only.",
    "Never use exec/curl for messaging.",
  ].join("\n"),
  silent_replies: [
    "## Silent Replies",
    "Use the silent reply token only when no user-visible reply is needed (housekeeping, no-op wakeups, after message tool delivered).",
    "Never use it to avoid work or end an actionable turn. It must be the entire message — never append to a real reply, never wrap in markdown.",
  ].join("\n"),
} as const;

export default definePluginEntry({
  id: "llamacpp",
  name: "llama.cpp Provider",
  description: "Bundled llama.cpp provider plugin with condensed system prompts for local models",
  register(api: OpenClawPluginApi) {
    api.registerProvider({
      id: PROVIDER_ID,
      label: "llama.cpp",
      envVars: ["LLAMACPP_API_KEY"],
      auth: [],
      resolveSystemPromptContribution: () => ({
        sectionOverrides: CONDENSED_OVERRIDES,
      }),
      normalizeToolSchemas: condenseLlamacppToolSchemas,
      resolveSyntheticAuth: ({ providerConfig }) => {
        const hasApiConfig =
          Boolean(providerConfig?.api?.trim()) ||
          Boolean(providerConfig?.baseUrl?.trim()) ||
          (Array.isArray(providerConfig?.models) && providerConfig.models.length > 0);
        if (!hasApiConfig) {
          return undefined;
        }
        return {
          apiKey: "LLAMACPP_LOCAL_KEY",
          source: "models.providers.llamacpp (synthetic local key)",
          mode: "api-key",
        };
      },
    });
  },
});
