import type { Board as BoardType, UserRole, PlayerColor } from "./types";
import "./index.css";

interface BoardProps {
  board: BoardType;
  role: UserRole;
  currentTurn: PlayerColor;
  isPlaying: boolean;
  lastMove: { row: number; col: number } | null;
  winningLine: number[][] | null;
  cellSize?: number;
  onMove: (row: number, col: number) => void;
}

export function Board({ board, role, currentTurn, isPlaying, lastMove, winningLine, cellSize = 32, onMove }: BoardProps) {
  const canPlace = role !== "spectator" && isPlaying;
  const myColor: PlayerColor | null = role === "black" ? 1 : role === "white" ? 2 : null;
  const isMyTurn = myColor === currentTurn;

  const handleClick = (row: number, col: number) => {
    if (!canPlace || !isMyTurn) return;
    if (board[row]?.[col] !== 0) return;
    onMove(row, col);
  };

  const isWinCell = (row: number, col: number) => {
    if (!winningLine) return false;
    return winningLine.some(([r, c]) => r === row && c === col);
  };

  return (
    <div className="gomoku-board-wrapper">
      <div
        className="gomoku-board"
        style={{ "--cell": `${cellSize}px`, "--stone": `${Math.floor(cellSize * 0.8)}px`, "--mark": `${Math.max(Math.floor(cellSize * 0.2), 3)}px` } as React.CSSProperties}
      >
        {Array.from({ length: 15 }, (_, row) =>
          Array.from({ length: 15 }, (_, col) => {
            const cell = board[row]?.[col] ?? 0 as 0 | 1 | 2;
            const isLast = lastMove?.row === row && lastMove?.col === col;
            const isWin = isWinCell(row, col);
            const canClick = canPlace && isMyTurn && cell === 0;

            return (
              <div
                key={`${row}-${col}`}
                className={`gomoku-cell ${canClick ? "clickable" : ""}`}
                onClick={() => handleClick(row, col)}
              >
                {cell !== 0 && (
                  <div className={`gomoku-stone ${cell === 1 ? "black" : "white"} ${isWin ? "winning" : ""}`}>
                    {isLast && <div className="gomoku-last-mark" />}
                  </div>
                )}
                {canClick && cell === 0 && (
                  <div className={`gomoku-preview ${myColor === 1 ? "black" : "white"}`} />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
