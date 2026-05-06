export type Board = (0 | 1 | 2)[][];
export type PlayerColor = 1 | 2;
export type GameStatus = "waiting" | "playing" | "ended";
export type UserRole = "black" | "white" | "spectator";

export interface PlayerInfo {
  userId: string;
  ready: boolean;
}

export interface SpectatorInfo {
  userId: string;
}

export interface RoomState {
  roomId: string;
  board: Board;
  players: {
    black: PlayerInfo | null;
    white: PlayerInfo | null;
  };
  spectators: SpectatorInfo[];
  currentTurn: PlayerColor;
  status: GameStatus;
  moveHistory: Array<{ row: number; col: number; player: PlayerColor }>;
  winner: PlayerColor | null;
}

export type ServerMessage =
  | { type: "room_state"; data: RoomState }
  | { type: "role_assigned"; data: { color: UserRole } }
  | { type: "user_joined"; data: { userId: string; role: UserRole; playerCount: number; spectatorCount: number } }
  | { type: "user_left"; data: { userId: string; playerCount: number; spectatorCount: number } }
  | { type: "ready_changed"; data: { userId: string; ready: boolean; color: string } }
  | { type: "game_start"; data: { currentTurn: PlayerColor } }
  | { type: "move_made"; data: { row: number; col: number; player: PlayerColor } }
  | { type: "error"; data: { message: string } }
  | { type: "undo_requested"; data: { from: string } }
  | { type: "undo_result"; data: { accepted: boolean; board: Board; moveHistory: RoomState["moveHistory"]; currentTurn: PlayerColor } }
  | { type: "game_over"; data: { winner: PlayerColor | 0; reason: string; winningLine: number[][] } }
  | { type: "player_surrendered"; data: { player: PlayerColor } }
  | { type: "restart_requested"; data: { from: string } }
  | { type: "game_restart"; data: RoomState }
  | { type: "opponent_disconnected"; data: { userId: string; color: string; graceSeconds: number } }
  | { type: "opponent_reconnected"; data: { userId: string; color: string } };
