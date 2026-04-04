import React from "react";

import { errorToMessage } from "@shared/toast";
import type { ConfigSnapshot, GatewayRpcLike } from "../../onboarding/hooks/types";
import { disableSkill, type SkillId } from "./useSkillsStatus";

/** Manages opening/closing skill modals and connect/disable actions. */
export function useSkillModal(props: {
  gw: GatewayRpcLike;
  markConnected: (id: SkillId) => void;
  markDisabled: (id: SkillId) => void;
  refresh: () => Promise<void>;
  loadConfig: () => Promise<ConfigSnapshot>;
  onError: (value: string | null) => void;
}) {
  const { gw, markConnected, markDisabled, refresh, loadConfig, onError } = props;
  const [activeModal, setActiveModal] = React.useState<SkillId | null>(null);

  const openModal = React.useCallback((skillId: SkillId) => {
    setActiveModal(skillId);
  }, []);

  const closeModal = React.useCallback(() => {
    setActiveModal(null);
  }, []);

  /** Called by modal content after a successful connection. */
  const handleConnected = React.useCallback(
    (skillId: SkillId) => {
      markConnected(skillId);
      void refresh();
      setActiveModal(null);
    },
    [markConnected, refresh]
  );

  /** Called by modal content after disabling a skill. */
  const handleDisabled = React.useCallback(
    async (skillId: SkillId) => {
      onError(null);
      try {
        await disableSkill(gw, loadConfig, skillId);
        markDisabled(skillId);
        void refresh();
        setActiveModal(null);
      } catch (err) {
        onError(errorToMessage(err));
      }
    },
    [gw, loadConfig, markDisabled, onError, refresh]
  );

  return {
    activeModal,
    openModal,
    closeModal,
    handleConnected,
    handleDisabled,
  };
}
