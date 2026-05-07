export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

export type PlayerPosition = "top" | "right" | "bottom" | "left";

export interface Player {
  id: number;
  name: string;
  cards: Card[];
  position: PlayerPosition;
}

export type PlayerCardsMap = Record<number, Card[]>;
