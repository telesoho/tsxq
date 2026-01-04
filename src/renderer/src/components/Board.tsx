import React from 'react';
import { BoardState, getPieceName, isRed } from '../lib/xiangqi';

interface BoardProps {
  board: BoardState;
  onSquareClick: (row: number, col: number) => void;
  selectedSquare: { row: number, col: number } | null;
  lastMove: { from: { row: number, col: number }, to: { row: number, col: number } } | null;
}

const CELL_SIZE = 60;
const BOARD_WIDTH = CELL_SIZE * 8;
const BOARD_HEIGHT = CELL_SIZE * 9;
const PADDING = 40;

export const Board: React.FC<BoardProps> = ({ board, onSquareClick, selectedSquare, lastMove }) => {
  // Draw the grid
  const renderGrid = () => {
    return (
      <svg width={BOARD_WIDTH + PADDING * 2} height={BOARD_HEIGHT + PADDING * 2} className="absolute top-0 left-0 z-0 pointer-events-none">
        <g transform={`translate(${PADDING}, ${PADDING})`}>
          {/* Horizontal lines */}
          {Array.from({ length: 10 }).map((_, i) => (
            <line key={`h-${i}`} x1={0} y1={i * CELL_SIZE} x2={BOARD_WIDTH} y2={i * CELL_SIZE} stroke="#000" strokeWidth={1} />
          ))}
          {/* Vertical lines (split for river) */}
          {Array.from({ length: 9 }).map((_, i) => {
             if (i === 0 || i === 8) {
               return <line key={`v-${i}`} x1={i * CELL_SIZE} y1={0} x2={i * CELL_SIZE} y2={BOARD_HEIGHT} stroke="#000" strokeWidth={1} />
             } else {
               return (
                 <g key={`v-${i}`}>
                   <line x1={i * CELL_SIZE} y1={0} x2={i * CELL_SIZE} y2={4 * CELL_SIZE} stroke="#000" strokeWidth={1} />
                   <line x1={i * CELL_SIZE} y1={5 * CELL_SIZE} x2={i * CELL_SIZE} y2={9 * CELL_SIZE} stroke="#000" strokeWidth={1} />
                 </g>
               )
             }
          })}
          {/* Palace diagonals */}
          <line x1={3 * CELL_SIZE} y1={0} x2={5 * CELL_SIZE} y2={2 * CELL_SIZE} stroke="#000" strokeWidth={1} />
          <line x1={5 * CELL_SIZE} y1={0} x2={3 * CELL_SIZE} y2={2 * CELL_SIZE} stroke="#000" strokeWidth={1} />
          <line x1={3 * CELL_SIZE} y1={7 * CELL_SIZE} x2={5 * CELL_SIZE} y2={9 * CELL_SIZE} stroke="#000" strokeWidth={1} />
          <line x1={5 * CELL_SIZE} y1={7 * CELL_SIZE} x2={3 * CELL_SIZE} y2={9 * CELL_SIZE} stroke="#000" strokeWidth={1} />
          
          {/* River Text */}
          <text x={2 * CELL_SIZE} y={4.5 * CELL_SIZE} dy="0.3em" fontSize="24" textAnchor="middle" style={{writingMode: 'vertical-rl'}}>楚河</text>
          <text x={6 * CELL_SIZE} y={4.5 * CELL_SIZE} dy="0.3em" fontSize="24" textAnchor="middle" style={{writingMode: 'vertical-rl'}}>汉界</text>

          {/* Coordinates */}
          {/* Top (Black): 1 2 3 4 5 6 7 8 9 (Left to Right) */}
          {Array.from({ length: 9 }).map((_, i) => (
            <text key={`num-top-${i}`} x={i * CELL_SIZE} y={-10} textAnchor="middle" fontSize="14" fill="#333">{i + 1}</text>
          ))}
          
          {/* Bottom (Red): 九 八 ... 一 (Left to Right) */}
          {['九', '八', '七', '六', '五', '四', '三', '二', '一'].map((char, i) => (
             <text key={`num-bot-${i}`} x={i * CELL_SIZE} y={BOARD_HEIGHT + 20} textAnchor="middle" fontSize="14" fill="#333">{char}</text>
          ))}
        </g>
      </svg>
    );
  };

  return (
    <div className="relative select-none bg-amber-100 rounded-lg shadow-xl" style={{ width: BOARD_WIDTH + PADDING * 2, height: BOARD_HEIGHT + PADDING * 2 }}>
      {renderGrid()}
      <div className="absolute top-0 left-0 w-full h-full" style={{ padding: PADDING }}>
        {board.map((row, r) => (
          row.map((piece, c) => {
            const isSelected = selectedSquare?.row === r && selectedSquare?.col === c;
            const isLastMoveFrom = lastMove?.from.row === r && lastMove?.from.col === c;
            const isLastMoveTo = lastMove?.to.row === r && lastMove?.to.col === c;
            
            return (
              <div
                key={`${r}-${c}`}
                onClick={() => onSquareClick(r, c)}
                className={`absolute flex items-center justify-center rounded-full cursor-pointer transition-transform
                  ${isSelected ? 'ring-4 ring-blue-500 z-10 scale-110' : ''}
                  ${(isLastMoveFrom || isLastMoveTo) && !isSelected ? 'ring-2 ring-green-500' : ''}
                `}
                style={{
                  width: CELL_SIZE - 6,
                  height: CELL_SIZE - 6,
                  left: c * CELL_SIZE + PADDING - (CELL_SIZE - 6)/2,
                  top: r * CELL_SIZE + PADDING - (CELL_SIZE - 6)/2,
                  transform: `translate(3px, 3px)` // Center adjustment
                }}
              >
                {piece && (
                  <div className={`
                    w-full h-full rounded-full border-2 flex items-center justify-center font-bold text-2xl shadow-md
                    ${isRed(piece.color) ? 'bg-red-50 text-red-600 border-red-600' : 'bg-stone-800 text-stone-100 border-stone-900'}
                  `}>
                    {getPieceName(piece.type, piece.color)}
                  </div>
                )}
                {/* Click target for empty squares */}
                {!piece && <div className="w-full h-full opacity-0 hover:opacity-20 bg-blue-400 rounded-full"></div>}
              </div>
            );
          })
        ))}
      </div>
    </div>
  );
};
