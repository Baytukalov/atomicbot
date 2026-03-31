import { createContext, useContext } from "react";

export type OnboardingFlow = "paid" | "self-managed" | "local-model";

export const OnboardingFlowContext = createContext<OnboardingFlow>("self-managed");

export function useOnboardingFlow(): OnboardingFlow {
  return useContext(OnboardingFlowContext);
}
