import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionStatus } from "@/hooks/useYjsCollaboration";
import type { RoomState, ServerMessage, Tile } from "./types";
import { RECONNECT_DELAY, MAX_RECONNECT_ATTEMPTS } from "./constants";
import { getClientId, sameTile } from "./utils";

export function useMahjongWebSocket(roomId: string, token: string, nickname: string) {
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [mySeat, setMySeat] = useState<number>(-1);
  const [myHand, setMyHand] = useState<Tile[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const mySeatRef = useRef(-1);

  const sendMessage = useCallback((type: string, data?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    }
  }, []);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "room_state":
        setRoomState(msg.data);
        break;
      case "role_assigned":
        setMySeat(msg.data.seat);
        mySeatRef.current = msg.data.seat;
        break;
      case "hand":
        if (mySeatRef.current === msg.data.seat) {
          setMyHand(msg.data.tiles);
        }
        break;
      case "your_draw":
        if (mySeatRef.current === msg.data.player) {
          setMyHand((prev) => [...prev, msg.data.tile]);
        }
        break;
      case "tile_discarded":
        if (mySeatRef.current === msg.data.player) {
          setMyHand((prev) => {
            const idx = prev.findIndex((t) => t.id === msg.data.tile.id);
            if (idx >= 0) {
              const next = [...prev];
              next.splice(idx, 1);
              return next;
            }
            return prev;
          });
        }
        break;
      case "peng":
        if (mySeatRef.current === msg.data.player) {
          setMyHand((prev) => {
            let toRemove = 2;
            return prev.filter((t) => {
              if (toRemove > 0 && sameTile(t, msg.data.tile)) {
                toRemove--;
                return false;
              }
              return true;
            });
          });
        }
        break;
      case "gang":
        if (mySeatRef.current === msg.data.player) {
          setMyHand((prev) => {
            let toRemove = 3;
            return prev.filter((t) => {
              if (toRemove > 0 && sameTile(t, msg.data.tile)) {
                toRemove--;
                return false;
              }
              return true;
            });
          });
        }
        break;
      case "hu":
      case "game_over":
        setRoomState((prev) => (prev ? { ...prev, status: "ended" } : prev));
        break;
      case "player_left":
      case "player_reconnected":
        break;
      case "error":
        console.error("[Mahjong] error:", msg.data.message);
        break;
    }
  }, []);

  const connect = useCallback(() => {
    if (!roomId) return;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      intentionalCloseRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }

    intentionalCloseRef.current = false;
    setConnectionStatus("connecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const clientId = getClientId();
    const wsUrl = `${protocol}//${window.location.host}/api/ws/mahjong/${roomId}?token=${token}&clientId=${encodeURIComponent(clientId)}&nickname=${encodeURIComponent(nickname)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectCountRef.current = 0;
      setConnectionStatus("connected");
    };

    ws.onclose = () => {
      if (intentionalCloseRef.current) return;
      setConnectionStatus("error");
      if (reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectCountRef.current++;
        const delay = RECONNECT_DELAY * reconnectCountRef.current;
        console.log(`[Mahjong] ${delay / 1000}s 后重连 (第${reconnectCountRef.current}次)`);
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    ws.onerror = () => {
      // onclose 会处理重连
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        handleMessage(msg);
      } catch {
        // ignore
      }
    };
  }, [roomId, token, nickname, handleMessage]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    setConnectionStatus("idle");
    reconnectCountRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, []);

  return {
    roomState,
    mySeat,
    myHand,
    connectionStatus,
    connect,
    disconnect,
    ready: () => sendMessage("ready"),
    discard: (tile: Tile) => sendMessage("discard", { tile }),
    peng: (tile: Tile) => sendMessage("peng", { tile }),
    gang: (tile: Tile) => sendMessage("gang", { tile }),
    hu: () => sendMessage("hu"),
    pass: () => sendMessage("pass"),
  };
}
