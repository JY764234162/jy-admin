import type { Suit, Rank } from "./types";

export const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
export const RANKS: Rank[] = [
  "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
];

export const RANK_ORDER: Record<Rank, number> = {
  "3": 1,
  "4": 2,
  "5": 3,
  "6": 4,
  "7": 5,
  "8": 6,
  "9": 7,
  "10": 8,
  J: 9,
  Q: 10,
  K: 11,
  A: 12,
  "2": 13,
};

export const SUIT_ORDER: Record<Suit, number> = {
  "♠": 1,
  "♥": 2,
  "♦": 3,
  "♣": 4,
};

export const PLAYER_CONFIGS = [
  { id: 1, name: "玩家1", position: "bottom" as const },
  { id: 2, name: "玩家2", position: "right" as const },
  { id: 3, name: "玩家3", position: "top" as const },
  { id: 4, name: "玩家4", position: "left" as const },
];

export const CARDS_PER_PLAYER = 13;
export const TOTAL_CARDS = 52;
