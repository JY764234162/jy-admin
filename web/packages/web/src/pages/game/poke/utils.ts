import type { Card, Player, PlayerCardsMap } from "./types";
import { SUITS, RANKS, RANK_ORDER, SUIT_ORDER, PLAYER_CONFIGS, CARDS_PER_PLAYER } from "./constants";

export function initializeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${suit}-${rank}` });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
}

export function sortDeck(deck: Card[]): Card[] {
  return [...deck].sort((a, b) => {
    const rankDiff = RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
    if (rankDiff !== 0) return rankDiff;
    return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
  });
}

export function dealCardsRandom(): Player[] {
  const deck = shuffleDeck(initializeDeck());
  const players: Player[] = PLAYER_CONFIGS.map((config) => ({
    ...config,
    cards: [],
  }));

  deck.forEach((card, index) => {
    const playerIndex = index % 4;
    players[playerIndex]!.cards.push(card);
  });

  players.forEach((player) => {
    player.cards = sortCards(player.cards);
  });

  return players;
}

export function distributeCards(selectedMap: PlayerCardsMap): Player[] {
  const deck = sortDeck(initializeDeck());
  const allSelected = Object.values(selectedMap).flat();
  const remaining = shuffleDeck(
    deck.filter((card) => !allSelected.find((c) => c.id === card.id))
  );

  const players: Player[] = PLAYER_CONFIGS.map((config) => ({
    ...config,
    cards: [...(selectedMap[config.id] ?? [])],
  }));

  const needCards = players.filter((p) => p.cards.length < CARDS_PER_PLAYER);
  let cardIndex = 0;
  while (cardIndex < remaining.length) {
    for (const player of needCards) {
      if (player.cards.length < CARDS_PER_PLAYER && cardIndex < remaining.length) {
        player.cards.push(remaining[cardIndex]!);
        cardIndex++;
      }
    }
  }

  players.forEach((player) => {
    player.cards = sortCards(player.cards);
  });

  return players;
}

export function filterValidSelection(
  savedSelection: PlayerCardsMap,
  availableDeck: Card[]
): PlayerCardsMap {
  const valid: PlayerCardsMap = { 1: [], 2: [], 3: [], 4: [] };
  for (let i = 1; i <= 4; i++) {
    valid[i] = (savedSelection[i] ?? []).filter((card) =>
      availableDeck.find((c) => c.id === card.id)
    );
  }
  return valid;
}

export function hasSelection(selection: PlayerCardsMap): boolean {
  return Object.values(selection).some((cards) => cards.length > 0);
}
