import { useRef, useState } from "react";
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

  const boardRef = useRef<HTMLDivElement>(null);
  const [previewPos, setPreviewPos] = useState<{ row: number; col: number } | null>(null);
  const touchEndTimeRef = useRef(0);

  const getCellFromTouch = (touch: { clientX: number; clientY: number }) => {
    if (!boardRef.current) return null;
    const rect = boardRef.current.getBoundingClientRect();
    const col = Math.floor((touch.clientX - rect.left) / cellSize);
    const row = Math.floor((touch.clientY - rect.top) / cellSize);
    if (row < 0 || row >= 15 || col < 0 || col >= 15) return null;
    return { row, col };
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const pos = getCellFromTouch(touch);
    if (pos) setPreviewPos(pos);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const pos = getCellFromTouch(touch);
    if (pos) setPreviewPos(pos);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    if (!touch) {
      setPreviewPos(null);
      return;
    }
    const pos = getCellFromTouch(touch);
    if (pos) {
      const { row, col } = pos;
      if (canPlace && isMyTurn && board[row]?.[col] === 0) {
        onMove(row, col);
      }
      touchEndTimeRef.current = Date.now();
    }
    setPreviewPos(null);
  };

  const handleClick = (row: number, col: number) => {
    if (Date.now() - touchEndTimeRef.current < 300) return;
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
        ref={boardRef}
        className="gomoku-board"
        style={{ "--cell": `${cellSize}px`, "--stone": `${Math.floor(cellSize * 0.8)}px`, "--mark": `${Math.max(Math.floor(cellSize * 0.2), 3)}px` } as React.CSSProperties}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {Array.from({ length: 15 }, (_, row) =>
          Array.from({ length: 15 }, (_, col) => {
            const cell = board[row]?.[col] ?? 0 as 0 | 1 | 2;
            const isLast = lastMove?.row === row && lastMove?.col === col;
            const isWin = isWinCell(row, col);
            const canClick = canPlace && isMyTurn && cell === 0;
            const isPreview = previewPos?.row === row && previewPos?.col === col;

            return (
              <div
                key={`${row}-${col}`}
                className={`gomoku-cell ${canClick ? "clickable" : ""} ${isPreview ? "touch-active" : ""}`}
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
