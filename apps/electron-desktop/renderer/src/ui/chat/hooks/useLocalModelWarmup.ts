import React from "react";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { llamacppActions } from "@store/slices/llamacppSlice";
import { getDesktopApiOrNull } from "@ipc/desktopApi";

const POLL_INTERVAL_MS = 1_000;

/**
 * Polls main-process warmup state and mirrors it into Redux
 * so WarmupBanner can display progress. Warmup is now initiated
 * entirely by the main process after llama-server becomes healthy.
 */
export function useLocalModelWarmup(): void {
  const dispatch = useAppDispatch();
  const authMode = useAppSelector((s) => s.auth.mode);

  React.useEffect(() => {
    if (authMode !== "local-model") {
      dispatch(llamacppActions.setWarmupStatus("idle"));
      return;
    }

    const api = getDesktopApiOrNull();
    if (!api?.llamacppWarmupGet) return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const mainState = await api.llamacppWarmupGet();
        if (cancelled) return;

        if (mainState.state === "done") {
          dispatch(llamacppActions.setWarmupStatus("ready"));
        } else if (mainState.state === "warming") {
          dispatch(llamacppActions.setWarmupStatus("warming"));
        }
        // "idle" in main means warmup hasn't started or was reset — keep current status
      } catch {
        // IPC unavailable, ignore
      }
    };

    void poll();
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [authMode, dispatch]);
}
