// KeepAlive.js（简洁函数式版本：只负责把 container 挂到当前占位符）
import React, { useEffect, useRef } from "react";
import { useAliveScope } from "./aliveScopeContext";

export const KeepAlive: React.FC<{ cacheKey: string; children: React.ReactNode }> = ({ cacheKey, children }) => {
  const scope = useAliveScope();
  const placeholderRef = useRef<HTMLDivElement | null>(null);

  // 让 AliveScope 缓存并渲染 children（通过 Portal 渲染到 container）
  useEffect(() => {
    if (!scope) return;
    scope.keep(cacheKey, children);
  }, [cacheKey, children, scope]);

  // 把对应 cacheKey 的 container 从隐藏宿主移动到当前占位符
  useEffect(() => {
    if (!scope) return;
    const container = scope.getContainer(cacheKey);
    const placeholder = placeholderRef.current;
    const hiddenHost = scope.getHiddenHost();
    if (!container || !placeholder || !hiddenHost) return;

    placeholder.appendChild(container);

    return () => {
      hiddenHost.appendChild(container);
    };
  }, [cacheKey, scope]);

  // 没有 AliveScope，退化成普通渲染
  if (!scope) return <>{children}</>;
  return <div className="ka-wrapper" ref={placeholderRef} style={{ width: "100%", height: "100%" }} />;
};
