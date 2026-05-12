import { useEffect, useRef } from "react";

export interface GlobalShortcutOptions {
  /** 监听的按键，大小写不敏感，例如 'f'、'k'、'Escape' */
  key: string;
  /** 是否需要 Command(Mac) / Ctrl(Win/Linux) 修饰键，默认 false */
  mod?: boolean;
  /** 是否需要 Shift 修饰键 */
  shift?: boolean;
  /** 是否需要 Alt/Option 修饰键 */
  alt?: boolean;
  /** 是否阻止浏览器默认行为，默认 true(劫持快捷键时基本都需要) */
  preventDefault?: boolean;
  /** 是否启用,设为 false 可方便关闭功能 */
  enabled?: boolean;
}

/**
 * 全局键盘快捷键 Hook,跨平台兼容(Mac Cmd / Win&Linux Ctrl 通过 mod 选项统一处理)
 *
 * @example
 *   useGlobalShortcut({ key: 'f', mod: true }, () => toggleSearch())
 */
export function useGlobalShortcut(
  options: GlobalShortcutOptions,
  handler: (e: KeyboardEvent) => void,
) {
  const {
    key,
    mod = false,
    shift = false,
    alt = false,
    preventDefault = true,
    enabled = true,
  } = options;

  // 用 ref 持有最新 handler,避免 handler 频繁变更导致重复绑定
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key.toLowerCase()) return;

      const modPressed = e.metaKey || e.ctrlKey;
      if (mod !== modPressed) return;
      if (shift !== e.shiftKey) return;
      if (alt !== e.altKey) return;

      if (preventDefault) e.preventDefault();
      handlerRef.current(e);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, mod, shift, alt, preventDefault, enabled]);
}
