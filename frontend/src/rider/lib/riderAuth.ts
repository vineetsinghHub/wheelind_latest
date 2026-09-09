import { createContext, useContext } from "react";

export interface RiderAuthValue {
  signedIn: boolean;
  loading: boolean;
  /** Runs `after` immediately when signed in, otherwise opens the sign-in modal. */
  requireSignIn: (after?: () => void) => void;
}

export const RiderAuthContext = createContext<RiderAuthValue>({
  signedIn: false,
  loading: false,
  requireSignIn: () => {},
});

export function useRiderAuth() {
  return useContext(RiderAuthContext);
}
