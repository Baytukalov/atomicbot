import React from "react";
import type { UiToolCall, UiToolResult, LiveToolCall } from "@store/slices/chat/chatSlice";
import { ToolCallCard } from "./ToolCallCard";
import { LiveToolCallCardItem, getToolLabel } from "./ToolCallCard";
import { HIDDEN_TOOL_NAMES } from "./ToolCallCard";
import al from "./ActionLog.module.css";

export type ActionLogCard = { toolCall: UiToolCall; result?: UiToolResult };

export function ActionLog({
  cards = [],
  liveToolCalls = [],
}: {
  cards?: ActionLogCard[];
  liveToolCalls?: LiveToolCall[];
}) {
  const visibleLive = liveToolCalls.filter((tc) => !HIDDEN_TOOL_NAMES.has(tc.name));
  const hasLive = visibleLive.length > 0;
  const [expanded, setExpanded] = React.useState(false);
  const title = hasLive ? getToolLabel(visibleLive[visibleLive.length - 1].name) : "Action Log";

  return (
    <div className={al.ActionLog}>
      <button
        type="button"
        className={al.ActionLogHeader}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={hasLive ? `${al.ActionLogHeaderTitle} AnimatedTitleLoader` : ""}>
          {title}
        </span>
        <svg
          className={`${al.ActionLogChevron} ${expanded ? al.ActionLogChevronOpen : ""}`}
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>
      {expanded ? (
        <div className={al.ActionLogBody}>
          <div className={al.ActionLogList}>
            {cards?.map(({ toolCall, result }) => (
              <div key={toolCall.id} className={al.ActionLogItem}>
                <div className={al.ActionLogDotWrap}>
                  <span className={al.ActionLogDot} />
                </div>
                <div className={al.ActionLogCard}>
                  <ToolCallCard toolCall={toolCall} result={result} />
                </div>
              </div>
            ))}
            {visibleLive?.map((tc) => (
              <div key={tc.toolCallId} className={al.ActionLogItem}>
                <div className={al.ActionLogDotWrap}>
                  <span className={al.ActionLogDot} />
                </div>
                <div className={al.ActionLogCard}>
                  <LiveToolCallCardItem tc={tc} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
