import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionStatus } from "@/hooks/useYjsCollaboration";
import type { RoomState, ServerMessage, UserRole } from "./types";

const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_ATTEMPTS = 10;
const CLIENT_ID_KEY = "gomoku_client_id";

function getClientId(): string {
  let id = sessionStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export interface OpponentDisconnectInfo {
  userId: string;
  color: string;
  graceEndsAt: number;
}

export function useGameWebSocket(roomId: string, token: string) {
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [role, setRole] = useState<UserRole>("spectator");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [pendingUndoFrom, setPendingUndoFrom] = useState<string | null>(null);
  const [pendingRestartFrom, setPendingRestartFrom] = useState<string | null>(null);
  const [opponentDisconnected, setOpponentDisconnected] = useState<OpponentDisconnectInfo | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const intentionalCloseRef = useRef(false);

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
        setRole(msg.data.color);
        break;
      case "game_start":
        setRoomState((prev) => prev ? { ...prev, status: "playing", currentTurn: msg.data.currentTurn } : prev);
        break;
      case "move_made":
        setRoomState((prev) => {
          if (!prev) return prev;
          const newBoard = prev.board.map((row) => [...row]) as RoomState["board"];
          newBoard[msg.data.row]![msg.data.col]! = msg.data.player;
          return {
            ...prev,
            board: newBoard,
            currentTurn: (msg.data.player === 1 ? 2 : 1) as 1 | 2,
            moveHistory: [...(prev.moveHistory ?? []), msg.data],
          };
        });
        break;
      case "game_over":
        setRoomState((prev) => prev ? { ...prev, status: "ended", winner: (msg.data.winner || null) as 1 | 2 | null } : prev);
        setOpponentDisconnected(null);
        break;
      case "undo_requested":
        setPendingUndoFrom(msg.data.from);
        break;
      case "undo_result":
        setPendingUndoFrom(null);
        if (msg.data.accepted) {
          setRoomState((prev) => prev ? { ...prev, board: msg.data.board, moveHistory: msg.data.moveHistory, currentTurn: msg.data.currentTurn } : prev);
        }
        break;
      case "player_surrendered":
        setRoomState((prev) => prev ? { ...prev, status: "ended" } : prev);
        break;
      case "restart_requested":
        setPendingRestartFrom(msg.data.from);
        break;
      case "game_restart":
        setRoomState(msg.data);
        setPendingRestartFrom(null);
        setOpponentDisconnected(null);
        break;
      case "opponent_disconnected":
        setOpponentDisconnected({
          userId: msg.data.userId,
          color: msg.data.color,
          graceEndsAt: Date.now() + msg.data.graceSeconds * 1000,
        });
        break;
      case "opponent_reconnected":
        setOpponentDisconnected(null);
        break;
      case "ready_changed":
        setRoomState((prev) => {
          if (!prev) return prev;
          const color = msg.data.color as "black" | "white";
          const player = prev.players[color];
          if (!player) return prev;
          return {
            ...prev,
            players: { ...prev.players, [color]: { ...player, ready: msg.data.ready } },
          };
        });
        break;
      case "user_left":
        break;
      case "error":
        console.error("[Game] error:", msg.data.message);
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
    const wsUrl = `${protocol}//${window.location.host}/api/ws/game/${roomId}?token=${token}&clientId=${encodeURIComponent(clientId)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectCountRef.current = 0;
      setConnectionStatus("connected");
    };

    ws.onclose = () => {
      if (intentionalCloseRef.current) return;
      setConnectionStatus("error");
      // 自动重连
      if (reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectCountRef.current++;
        const delay = RECONNECT_DELAY * reconnectCountRef.current;
        console.log(`[Game] ${delay / 1000}s 后重连 (第${reconnectCountRef.current}次)`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, token, handleMessage]);

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
    role,
    connectionStatus,
    pendingUndoFrom,
    pendingRestartFrom,
    opponentDisconnected,
    connect,
    disconnect,
    ready: () => sendMessage("ready"),
    unready: () => sendMessage("unready"),
    move: (row: number, col: number) => sendMessage("move", { row, col }),
    requestUndo: () => sendMessage("undo_request"),
    respondUndo: (accept: boolean) => {
      sendMessage("undo_response", { accept });
      setPendingUndoFrom(null);
    },
    surrender: () => sendMessage("surrender"),
    requestRestart: () => sendMessage("restart_request"),
    respondRestart: (accept: boolean) => {
      sendMessage("restart_response", { accept });
      setPendingRestartFrom(null);
    },
  };
}
