import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";

const MSG_UPDATE = 0x00;
const MSG_STATE = 0x01;

export function useYjsCollaboration(roomId: string, token: string) {
  const [connected, setConnected] = useState(false);
  const ydocRef = useRef<Y.Doc | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!roomId || !token || wsRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws/collab/${roomId}?token=${token}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[Yjs] WebSocket 已连接");
      setConnected(true);
    };
    ws.onclose = () => {
      console.log("[Yjs] WebSocket 已断开");
      setConnected(false);
    };
    ws.onerror = (err) => {
      console.error("[Yjs] WebSocket 错误:", err);
      setConnected(false);
    };

    ws.onmessage = (event) => {
      if (!ydocRef.current) return;
      const data = new Uint8Array(event.data as ArrayBuffer);
      if (data.length === 0) return;
      const msgType = data[0] === MSG_STATE ? "STATE" : "UPDATE";
      console.log(`[Yjs] 收到 ${msgType} 消息 (${data.length} bytes)`);
      Y.applyUpdate(ydocRef.current, data.slice(1), "remote");
    };

    const doc = new Y.Doc();
    ydocRef.current = doc;

    doc.on("update", (update: Uint8Array, origin: any) => {
      // 只广播本地产生的更新，避免远程更新的回声循环
      if (origin === "remote") return;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log(`[Yjs] 发送 UPDATE (${update.length} bytes)`);
        wsRef.current.send(new Uint8Array([MSG_UPDATE, ...update]));
      }
    });

    // 3 秒后发送一次完整状态（帮助后续加入的用户同步）
    setTimeout(() => {
      if (ydocRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        const state = Y.encodeStateAsUpdate(ydocRef.current);
        wsRef.current.send(new Uint8Array([MSG_STATE, ...state]));
      }
    }, 3000);
  }, [roomId, token]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    ydocRef.current?.destroy();
    ydocRef.current = null;
    setConnected(false);
  }, []);

  // 定期发送完整状态
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      if (ydocRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        const state = Y.encodeStateAsUpdate(ydocRef.current);
        wsRef.current.send(new Uint8Array([MSG_STATE, ...state]));
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [connected]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      ydocRef.current?.destroy();
    };
  }, []);

  return { ydocRef, wsRef, connected, connect, disconnect };
}
