import React, { createContext } from 'react';

export type AliveScopeContextType = {
  keep: (id: string, children: React.ReactNode) => void;
  getContainer: (id: string) => HTMLElement | undefined;
  getHiddenHost: () => HTMLElement | null;
};

export const AliveScopeContext = createContext<AliveScopeContextType | null>(null);

export function useAliveScope() {
  return React.useContext(AliveScopeContext);
}

