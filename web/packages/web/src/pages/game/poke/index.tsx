import "./index.css";
import { usePokeGame } from "./usePokeGame";
import { GameControls } from "./GameControls";
import { CardSelectorModal } from "./CardSelectorModal";
import { PlayedCardsArea } from "./PlayedCardsArea";
import { PlayerArea } from "./PlayerArea";
import { hasSelection } from "./utils";

export const Component = () => {
  const {
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
  } = usePokeGame();

  return (
    <div className="poke-game-container">
      <GameControls
        onDeal={dealCards}
        onOpenSelector={openCardSelector}
        onQuickDeal={quickDeal}
        onReset={resetAll}
        canQuickDeal={hasSelection(lastPlayerSelectedCards)}
      />

      {showCardSelector && (
        <CardSelectorModal
          availableCards={availableCards}
          playerSelectedCards={playerSelectedCards}
          selectingPlayer={selectingPlayer}
          onSelectingPlayerChange={setSelectingPlayer}
          onToggleCard={toggleCardSelection}
          onConfirm={confirmCardSelection}
          onCancel={closeCardSelector}
        />
      )}

      {isDealt && <PlayedCardsArea cards={lastPlayedCards} playedBy={lastPlayedBy} />}

      <div className="game-table">
        {players.map((player) => (
          <PlayerArea
            key={player.id}
            player={player}
            isCurrentPlayer={currentPlayer === player.id}
            playingCards={playingCards}
            onCardClick={togglePlayingCard}
            onPlayCards={playCards}
            onPassPlay={passPlay}
          />
        ))}
      </div>
    </div>
  );
};
