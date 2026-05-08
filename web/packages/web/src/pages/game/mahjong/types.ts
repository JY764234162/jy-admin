export type Suit = "wan" | "tong" | "tiao" | "zi";

export interface Tile {
  suit: Suit;
  value: number;
  id: string;
}

export interface Meld {
  type: "peng" | "gang" | "chi";
  tiles: Tile[];
  from: number;
}

export interface PlayerInfo {
  userId: string;
  seat: number;
  handCount: number;
  discardPile: Tile[];
  melds: Meld[];
  score: number;
  ready: boolean;
  isBot: boolean;
}

export type GameStatus = "waiting" | "playing" | "ended";

export interface RoomState {
  roomId: string;
  players: PlayerInfo[];
  currentPlayer: number;
  dealer: number;
  status: GameStatus;
  discardPile: Tile[];
  wallTiles: number;
  round: number;
  wind: string;
}

export type ServerMessage =
  | { type: "room_state"; data: RoomState }
  | { type: "role_assigned"; data: { seat: number } }
  | { type: "hand"; data: { tiles: Tile[]; seat: number } }
  | { type: "your_draw"; data: { tile: Tile; player: number } }
  | { type: "tile_drawn"; data: { player: number } }
  | { type: "tile_discarded"; data: { tile: Tile; player: number } }
  | { type: "peng"; data: { tile: Tile; player: number; meld: Meld } }
  | { type: "gang"; data: { tile: Tile; player: number; meld: Meld } }
  | { type: "hu"; data: { player: number; tiles: Tile[]; huType: string; score: number } }
  | { type: "game_over"; data: { scores: number[] } }
  | { type: "player_left"; data: { player: number; isBot: boolean } }
  | { type: "player_reconnected"; data: { player: number } }
  | { type: "error"; data: { message: string } };
