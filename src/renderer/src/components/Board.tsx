import React, { useRef, useLayoutEffect, useState } from 'react';
import { BoardState, getPieceName, isRed, Piece } from '../lib/xiangqi';

interface BoardProps {
  board: BoardState;
  onSquareClick: (row: number, col: number) => void;
  selectedSquare: { row: number, col: number } | null;
  lastMove: { from: { row: number, col: number }, to: { row: number, col: number } } | null;
  isFlipped?: boolean;
  bestMoves?: Array<{
      from: { row: number, col: number };
      to: { row: number, col: number };
      score: string;
      rank: number;
      chineseNotation?: string;
  }>;
}

const CELL_SIZE = 54;
const BOARD_WIDTH = CELL_SIZE * 8;
const BOARD_HEIGHT = CELL_SIZE * 9;
const PADDING = 30;

interface SquareProps {
    r: number;
    c: number;
    piece: Piece | null;
    onSquareClick: (row: number, col: number) => void;
    isSelected: boolean;
    isLastMoveFrom: boolean;
    isLastMoveTo: boolean;
    lastMove: { from: { row: number, col: number }, to: { row: number, col: number } } | null;
    isFlipped: boolean;
}

const Square: React.FC<SquareProps> = ({ r, c, piece, onSquareClick, isSelected, isLastMoveFrom, isLastMoveTo, lastMove, isFlipped }) => {
    const [animStyle, setAnimStyle] = useState<React.CSSProperties>({ transform: 'translate(3px, 3px)' });
    const lastAnimatedMoveRef = useRef<any>(null);

    // Calculate visual position for static placement
    const visualR = isFlipped ? 9 - r : r;
    const visualC = isFlipped ? 8 - c : c;
    const left = visualC * CELL_SIZE + PADDING - (CELL_SIZE - 6)/2;
    const top = visualR * CELL_SIZE + PADDING - (CELL_SIZE - 6)/2;

    useLayoutEffect(() => {
        if (isLastMoveTo && lastMove && lastMove !== lastAnimatedMoveRef.current) {
            lastAnimatedMoveRef.current = lastMove;

            const fromR = lastMove.from.row;
            const fromC = lastMove.from.col;
            const toR = lastMove.to.row;
            const toC = lastMove.to.col;

            // Calculate visual delta
            const visualFromR = isFlipped ? 9 - fromR : fromR;
            const visualFromC = isFlipped ? 8 - fromC : fromC;
            const visualToR = isFlipped ? 9 - toR : toR;
            const visualToC = isFlipped ? 8 - toC : toC;

            const deltaX = (visualFromC - visualToC) * CELL_SIZE;
            const deltaY = (visualFromR - visualToR) * CELL_SIZE;

            // Start position (with 3px offset for centering)
            setAnimStyle({ 
                transform: `translate(${deltaX + 3}px, ${deltaY + 3}px)`, 
                transition: 'none' 
            });

            // Animate to final position
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setAnimStyle({ 
                        transform: `translate(3px, 3px)`, 
                        transition: 'transform 0.2s ease-in-out' 
                    });
                });
            });
        }
    }, [lastMove, isLastMoveTo, isFlipped, r, c]);

    return (
        <div
            onClick={() => onSquareClick(r, c)}
            className={`absolute flex items-center justify-center rounded-full cursor-pointer transition-transform
              ${isSelected ? 'ring-4 ring-blue-500 z-10 scale-110' : ''}
              ${(isLastMoveFrom || isLastMoveTo) && !isSelected ? 'ring-2 ring-green-500' : ''}
            `}
            style={{
                width: CELL_SIZE - 6,
                height: CELL_SIZE - 6,
                left,
                top,
                ...animStyle
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
};

export const Board: React.FC<BoardProps> = ({ board, onSquareClick, selectedSquare, lastMove, isFlipped = false, bestMoves = [] }) => {
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
          {isFlipped ? (
             <>
               <text x={2 * CELL_SIZE} y={4.5 * CELL_SIZE} dy="0.3em" fontSize="24" textAnchor="middle" style={{writingMode: 'vertical-rl'}}>汉界</text>
               <text x={6 * CELL_SIZE} y={4.5 * CELL_SIZE} dy="0.3em" fontSize="24" textAnchor="middle" style={{writingMode: 'vertical-rl'}}>楚河</text>
             </>
          ) : (
             <>
               <text x={2 * CELL_SIZE} y={4.5 * CELL_SIZE} dy="0.3em" fontSize="24" textAnchor="middle" style={{writingMode: 'vertical-rl'}}>楚河</text>
               <text x={6 * CELL_SIZE} y={4.5 * CELL_SIZE} dy="0.3em" fontSize="24" textAnchor="middle" style={{writingMode: 'vertical-rl'}}>汉界</text>
             </>
          )}

          {/* Coordinates */}
          {isFlipped ? (
             <>
               {/* Top (Red): 一 二 ... 九 (Left to Right) */}
               {['一', '二', '三', '四', '五', '六', '七', '八', '九'].map((char, i) => (
                  <text key={`num-top-${i}`} x={i * CELL_SIZE} y={-10} textAnchor="middle" fontSize="14" fill="#333">{char}</text>
               ))}
               {/* Bottom (Black): 9 8 ... 1 (Left to Right) */}
               {['9', '8', '7', '6', '5', '4', '3', '2', '1'].map((char, i) => (
                  <text key={`num-bot-${i}`} x={i * CELL_SIZE} y={BOARD_HEIGHT + 20} textAnchor="middle" fontSize="14" fill="#333">{char}</text>
               ))}
             </>
          ) : (
             <>
               {/* Top (Black): 1 2 3 4 5 6 7 8 9 (Left to Right) */}
               {Array.from({ length: 9 }).map((_, i) => (
                 <text key={`num-top-${i}`} x={i * CELL_SIZE} y={-10} textAnchor="middle" fontSize="14" fill="#333">{i + 1}</text>
               ))}
               
               {/* Bottom (Red): 九 八 ... 一 (Left to Right) */}
               {['九', '八', '七', '六', '五', '四', '三', '二', '一'].map((char, i) => (
                  <text key={`num-bot-${i}`} x={i * CELL_SIZE} y={BOARD_HEIGHT + 20} textAnchor="middle" fontSize="14" fill="#333">{char}</text>
               ))}
             </>
          )}
        </g>
      </svg>
    );
  };

  const renderArrows = () => {
    if (!bestMoves || bestMoves.length === 0) return null;

    return (
        <svg width={BOARD_WIDTH + PADDING * 2} height={BOARD_HEIGHT + PADDING * 2} className="absolute top-0 left-0 z-20 pointer-events-none">
            <defs>
                <marker id="arrowhead-1" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#dc2626" />
                </marker>
                <marker id="arrowhead-2" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#d97706" />
                </marker>
                <marker id="arrowhead-3" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#2563eb" />
                </marker>
            </defs>
            <g transform={`translate(${PADDING}, ${PADDING})`}>
                {bestMoves.map((move, i) => {
                    const fromR = isFlipped ? 9 - move.from.row : move.from.row;
                    const fromC = isFlipped ? 8 - move.from.col : move.from.col;
                    const toR = isFlipped ? 9 - move.to.row : move.to.row;
                    const toC = isFlipped ? 8 - move.to.col : move.to.col;

                    const x1 = fromC * CELL_SIZE;
                    const y1 = fromR * CELL_SIZE;
                    const x2 = toC * CELL_SIZE;
                    const y2 = toR * CELL_SIZE;

                    const colors = ['#dc2626', '#d97706', '#2563eb']; // Red, Amber, Blue
                    const color = colors[i % colors.length];
                    const marker = `url(#arrowhead-${(i % 3) + 1})`;
                    const opacity = 0.8 - (i * 0.2);
                    
                    return (
                        <g key={`arrow-${i}`}>
                            <line 
                                x1={x1} y1={y1} x2={x2} y2={y2} 
                                stroke={color} 
                                strokeWidth={4 - i} 
                                strokeOpacity={opacity}
                                markerEnd={marker}
                            />
                            {/* Score Label */}
                            <rect 
                                x={(x1 + x2) / 2 - 20} 
                                y={(y1 + y2) / 2 - 10} 
                                width="40" 
                                height="20" 
                                rx="4"
                                fill="white"
                                stroke={color}
                                strokeWidth="1"
                            />
                            <text
                                x={(x1 + x2) / 2} 
                                y={(y1 + y2) / 2}
                                dy="0.3em"
                                fontSize="10"
                                textAnchor="middle"
                                fill={color}
                                fontWeight="bold"
                            >
                                {move.chineseNotation || move.score}
                            </text>
                        </g>
                    );
                })}
            </g>
        </svg>
    );
  };

  return (
    <div className="relative select-none bg-amber-100 rounded-lg shadow-xl" style={{ width: BOARD_WIDTH + PADDING * 2, height: BOARD_HEIGHT + PADDING * 2 }}>
      {renderGrid()}
      {renderArrows()}
      <div className="absolute top-0 left-0 w-full h-full" style={{ padding: PADDING }}>
        {board.map((row, r) => (
          row.map((piece, c) => {
            const isSelected = selectedSquare?.row === r && selectedSquare?.col === c;
            const isLastMoveFrom = lastMove?.from.row === r && lastMove?.from.col === c;
            const isLastMoveTo = lastMove?.to.row === r && lastMove?.to.col === c;
            
            return (
              <Square
                key={`${r}-${c}`}
                r={r}
                c={c}
                piece={piece}
                onSquareClick={onSquareClick}
                isSelected={isSelected}
                isLastMoveFrom={isLastMoveFrom}
                isLastMoveTo={isLastMoveTo}
                lastMove={lastMove}
                isFlipped={isFlipped}
              />
            );
          })
        ))}
      </div>
    </div>
  );
};
