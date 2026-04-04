import React from "react";

export function useSettingsSkillAdapter() {
  const run = React.useCallback(async <T,>(fn: () => Promise<T>) => fn(), []);
  const markSkillConnected = React.useCallback(() => {}, []);
  const goSkills = React.useCallback(() => {}, []);
  return { run, markSkillConnected, goSkills };
}
