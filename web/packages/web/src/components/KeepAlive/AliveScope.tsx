// AliveScope.js（简洁函数式版本：Portal + 移动 container）
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AliveScopeContext, type AliveScopeContextType } from './aliveScopeContext';

export const AliveScope: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hiddenHostRef = useRef<HTMLDivElement | null>(null);
  const containersRef = useRef<Map<string, HTMLElement>>(new Map());
  const nodesRef = useRef<Map<string, React.ReactNode>>(new Map());

  // 仅用于触发 rerender，让 portals 跟随 children 更新
  const [, bump] = useState(0);

  const keep = useCallback((id: string, next: React.ReactNode) => {
    nodesRef.current.set(id, next);

    if (!containersRef.current.has(id)) {
      const el = document.createElement('div');
      el.setAttribute('data-keepalive', id);
      containersRef.current.set(id, el);
    }

    bump((v) => v + 1);
  }, []);

  const getContainer = useCallback((id: string) => containersRef.current.get(id), []);
  const getHiddenHost = useCallback(() => hiddenHostRef.current, []);

  const contextValue = useMemo<AliveScopeContextType>(
    () => ({
      keep,
      getContainer,
      getHiddenHost,
    }),
    [keep, getContainer, getHiddenHost]
  );

  return (
    <AliveScopeContext.Provider value={contextValue}>
      {children}

      {/* 隐藏宿主：所有 keepalive 内容默认都挂在这里（不会卸载） */}
      <div ref={hiddenHostRef} style={{ display: 'none' }} />

      {/* 用 Portal 把每个缓存项渲染到它自己的 container 里 */}
      {Array.from(nodesRef.current.entries()).map(([id, node]) => {
        const container = containersRef.current.get(id);
        return container ? createPortal(node, container) : null;
      })}
    </AliveScopeContext.Provider>
  );
};
