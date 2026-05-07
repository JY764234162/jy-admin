import { useState, useCallback } from "react";
import type { Card, Player, PlayerCardsMap } from "./types";
import {
  initializeDeck,
  sortDeck,
  dealCardsRandom,
  distributeCards,
  filterValidSelection,
  hasSelection,
} from "./utils";

const EMPTY_SELECTION: PlayerCardsMap = { 1: [], 2: [], 3: [], 4: [] };

export function usePokeGame() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [isDealt, setIsDealt] = useState(false);
  const [showCardSelector, setShowCardSelector] = useState(false);
  const [availableCards, setAvailableCards] = useState<Card[]>([]);
  const [playerSelectedCards, setPlayerSelectedCards] = useState<PlayerCardsMap>({ ...EMPTY_SELECTION });
  const [selectingPlayer, setSelectingPlayer] = useState(1);
  const [lastPlayerSelectedCards, setLastPlayerSelectedCards] = useState<PlayerCardsMap>({ ...EMPTY_SELECTION });
  const [currentPlayer, setCurrentPlayer] = useState(1);
  const [playingCards, setPlayingCards] = useState<Card[]>([]);
  const [lastPlayedCards, setLastPlayedCards] = useState<Card[]>([]);
  const [lastPlayedBy, setLastPlayedBy] = useState<number | null>(null);

  const resetAll = useCallback(() => {
    setPlayers([]);
    setIsDealt(false);
    setPlayerSelectedCards({ ...EMPTY_SELECTION });
    setSelectingPlayer(1);
    setShowCardSelector(false);
    setCurrentPlayer(1);
    setPlayingCards([]);
    setLastPlayedCards([]);
    setLastPlayedBy(null);
  }, []);

  const dealCards = useCallback(() => {
    setPlayers(dealCardsRandom());
    setIsDealt(true);
  }, []);

  const openCardSelector = useCallback(() => {
    const deck = sortDeck(initializeDeck());
    setAvailableCards(deck);
    setPlayerSelectedCards(filterValidSelection(lastPlayerSelectedCards, deck));
    setSelectingPlayer(1);
    setShowCardSelector(true);
  }, [lastPlayerSelectedCards]);

  const closeCardSelector = useCallback(() => {
    setShowCardSelector(false);
    setPlayerSelectedCards({ ...EMPTY_SELECTION });
  }, []);

  const toggleCardSelection = useCallback((card: Card) => {
    setPlayerSelectedCards((prev) => {
      const current = prev[selectingPlayer] ?? [];
      const allSelected = Object.values(prev).flat();
      const isSelectedByCurrent = current.find((c) => c.id === card.id);
      const isSelectedByOther = allSelected.find((c) => c.id === card.id) && !isSelectedByCurrent;

      if (isSelectedByOther) {
        alert("这张牌已被其他玩家选中！");
        return prev;
      }
      if (current.length >= 13 && !isSelectedByCurrent) {
        alert("当前玩家已选择13张牌！");
        return prev;
      }

      const exists = current.find((c) => c.id === card.id);
      return {
        ...prev,
        [selectingPlayer]: exists
          ? current.filter((c) => c.id !== card.id)
          : [...current, card],
      };
    });
  }, [selectingPlayer]);

  const confirmCardSelection = useCallback(() => {
    const newPlayers = distributeCards(playerSelectedCards);
    setPlayers(newPlayers);
    setIsDealt(true);
    setShowCardSelector(false);
    setLastPlayerSelectedCards({ ...playerSelectedCards });
    setPlayerSelectedCards({ ...EMPTY_SELECTION });
  }, [playerSelectedCards]);

  const quickDeal = useCallback(() => {
    if (!hasSelection(lastPlayerSelectedCards)) {
      alert("请先使用选牌功能选择牌！");
      return;
    }
    const newPlayers = distributeCards(lastPlayerSelectedCards);
    setPlayers(newPlayers);
    setIsDealt(true);
  }, [lastPlayerSelectedCards]);

  const togglePlayingCard = useCallback((card: Card, playerId: number) => {
    if (playerId !== currentPlayer) return;
    setPlayingCards((prev) => {
      const exists = prev.find((c) => c.id === card.id);
      if (exists) return prev.filter((c) => c.id !== card.id);
      return [...prev, card];
    });
  }, [currentPlayer]);

  const playCards = useCallback(() => {
    if (playingCards.length === 0) {
      alert("请选择要出的牌！");
      return;
    }
    setPlayers((prev) =>
      prev.map((player) =>
        player.id === currentPlayer
          ? {
              ...player,
              cards: player.cards.filter(
                (card) => !playingCards.find((c) => c.id === card.id)
              ),
            }
          : player
      )
    );
    setLastPlayedCards([...playingCards]);
    setLastPlayedBy(currentPlayer);
    setPlayingCards([]);
    setCurrentPlayer((prev) => (prev % 4) + 1);
  }, [playingCards, currentPlayer]);

  const passPlay = useCallback(() => {
    setPlayingCards([]);
    setCurrentPlayer((prev) => (prev % 4) + 1);
  }, []);

  return {
    // state
    players,
    isDealt,
    showCardSelector,
    availableCards,
    playerSelectedCards,
    selectingPlayer,
    lastPlayerSelectedCards,
    currentPlayer,
    playingCards,
    lastPlayedCards,
    lastPlayedBy,
    // actions
    dealCards,
    resetAll,
    togglePlayingCard,
    playCards,
    passPlay,
    openCardSelector,
    closeCardSelector,
    toggleCardSelection,
    confirmCardSelection,
    quickDeal,
    setSelectingPlayer,
  };
}
