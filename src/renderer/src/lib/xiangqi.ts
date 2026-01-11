
export type PieceColor = 'w' | 'b'; // w=Red(White in FEN), b=Black
export type PieceType = 'k' | 'a' | 'b' | 'n' | 'r' | 'c' | 'p'; // King, Advisor, Bishop, Knight, Rook, Cannon, Pawn

export interface Piece {
  color: PieceColor;
  type: PieceType;
}

export type BoardState = (Piece | null)[][]; // 10 rows, 9 cols

export const START_FEN = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";

export function validateFen(fen: string): { valid: boolean; error?: string } {
  try {
    const { board } = parseFen(fen);
    
    // Counts
    const counts = {
      w: { k: 0, a: 0, b: 0, n: 0, r: 0, c: 0, p: 0 },
      b: { k: 0, a: 0, b: 0, n: 0, r: 0, c: 0, p: 0 }
    };

    // Positions for Kings to check Flying General
    let redKingPos: { r: number, c: number } | null = null;
    let blackKingPos: { r: number, c: number } | null = null;

    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const piece = board[r][c];
        if (piece) {
          counts[piece.color][piece.type]++;

          // Update King Positions
          if (piece.type === 'k') {
            if (piece.color === 'w') redKingPos = { r, c };
            else blackKingPos = { r, c };
          }

          // 1. Position Checks
          // Pawns
          if (piece.type === 'p') {
            if (piece.color === 'w') {
              // Red Pawn: Moves UP (towards 0). Starts at 6.
              // Cannot be behind starting line (7, 8, 9).
              if (r > 6) return { valid: false, error: '红兵位置错误 (Red Pawn at invalid rank)' };
              // Cannot move sideways before crossing river (River is between 4 and 5).
              // If at row 5 or 6, must be at even column.
              if (r >= 5 && c % 2 !== 0) return { valid: false, error: '红兵位置错误 (Red Pawn at invalid file before river)' };
            } else {
              // Black Pawn: Moves DOWN (towards 9). Starts at 3.
              // Cannot be behind starting line (0, 1, 2).
              if (r < 3) return { valid: false, error: '黑卒位置错误 (Black Pawn at invalid rank)' };
              // Cannot move sideways before crossing river.
              // If at row 3 or 4, must be at even column.
              if (r <= 4 && c % 2 !== 0) return { valid: false, error: '黑卒位置错误 (Black Pawn at invalid file before river)' };
            }
          }

          // Advisors (Palace)
          if (piece.type === 'a') {
             if (piece.color === 'w') {
                // Red: 7-9, 3-5
                if (r < 7 || r > 9 || c < 3 || c > 5) return { valid: false, error: '红仕位置错误 (Red Advisor outside palace)' };
             } else {
                // Black: 0-2, 3-5
                if (r < 0 || r > 2 || c < 3 || c > 5) return { valid: false, error: '黑士位置错误 (Black Advisor outside palace)' };
             }
          }

          // Bishops (Elephant) - Cannot cross river
          if (piece.type === 'b') {
             if (piece.color === 'w') {
                // Red: 5-9
                if (r < 5) return { valid: false, error: '红相位置错误 (Red Bishop crossed river)' };
             } else {
                // Black: 0-4
                if (r > 4) return { valid: false, error: '黑象位置错误 (Black Bishop crossed river)' };
             }
          }
          
          // Kings (Palace)
          if (piece.type === 'k') {
             if (piece.color === 'w') {
                if (r < 7 || r > 9 || c < 3 || c > 5) return { valid: false, error: '红帅位置错误 (Red King outside palace)' };
             } else {
                if (r < 0 || r > 2 || c < 3 || c > 5) return { valid: false, error: '黑将位置错误 (Black King outside palace)' };
             }
          }
        }
      }
    }

    // 2. Count Checks
    if (counts.w.k !== 1) return { valid: false, error: counts.w.k === 0 ? '缺少红帅 (Red King missing)' : '红帅多于1个 (Multiple Red Kings)' };
    if (counts.b.k !== 1) return { valid: false, error: counts.b.k === 0 ? '缺少黑将 (Black King missing)' : '黑将多于1个 (Multiple Black Kings)' };
    
    if (counts.w.a > 2) return { valid: false, error: '红仕多于2个 (Too many Red Advisors)' };
    if (counts.b.a > 2) return { valid: false, error: '黑士多于2个 (Too many Black Advisors)' };
    
    if (counts.w.b > 2) return { valid: false, error: '红相多于2个 (Too many Red Bishops)' };
    if (counts.b.b > 2) return { valid: false, error: '黑象多于2个 (Too many Black Bishops)' };
    
    if (counts.w.n > 2) return { valid: false, error: '红马多于2个 (Too many Red Knights)' };
    if (counts.b.n > 2) return { valid: false, error: '黑马多于2个 (Too many Black Knights)' };
    
    if (counts.w.r > 2) return { valid: false, error: '红车多于2个 (Too many Red Rooks)' };
    if (counts.b.r > 2) return { valid: false, error: '黑车多于2个 (Too many Black Rooks)' };
    
    if (counts.w.c > 2) return { valid: false, error: '红炮多于2个 (Too many Red Cannons)' };
    if (counts.b.c > 2) return { valid: false, error: '黑炮多于2个 (Too many Black Cannons)' };
    
    if (counts.w.p > 5) return { valid: false, error: '红兵多于5个 (Too many Red Pawns)' };
    if (counts.b.p > 5) return { valid: false, error: '黑卒多于5个 (Too many Black Pawns)' };

    // 3. Flying General Check
    if (redKingPos && blackKingPos && redKingPos.c === blackKingPos.c) {
      // Same column
      let obstacles = 0;
      const col = redKingPos.c;
      const minR = Math.min(redKingPos.r, blackKingPos.r);
      const maxR = Math.max(redKingPos.r, blackKingPos.r);
      
      for (let r = minR + 1; r < maxR; r++) {
        if (board[r][col]) {
          obstacles++;
        }
      }

      if (obstacles === 0) {
        return { valid: false, error: '将帅照面 (Flying General)' };
      }
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'FEN格式错误 (Invalid FEN format)' };
  }
}

export function validateMove(board: BoardState, move: { from: { row: number, col: number }, to: { row: number, col: number } }): { valid: boolean; error?: string } {
    const { from, to } = move;
    const piece = board[from.row][from.col];
  
    // 1. Basic checks
    if (!piece) return { valid: false, error: '无棋子 (No piece)' };
    if (from.row === to.row && from.col === to.col) return { valid: false, error: '目标位置相同 (Same square)' };
    
    const target = board[to.row][to.col];
    if (target && target.color === piece.color) return { valid: false, error: '不能吃自己的棋子 (Cannot capture own piece)' };
  
    // 2. Specific piece rules
    const dr = to.row - from.row;
    const dc = to.col - from.col;
    const absDr = Math.abs(dr);
    const absDc = Math.abs(dc);
  
    switch (piece.type) {
      case 'k': // King / General
        // 1 step orthogonal
        if ((absDr === 1 && absDc === 0) || (absDr === 0 && absDc === 1)) {
            // Check Palace
            if (to.col < 3 || to.col > 5) return { valid: false, error: '将帅不能出九宫 (King cannot leave palace)' };
            if (piece.color === 'w') {
                if (to.row < 7 || to.row > 9) return { valid: false, error: '帅不能出九宫 (Red King cannot leave palace)' };
            } else {
                if (to.row < 0 || to.row > 2) return { valid: false, error: '将不能出九宫 (Black King cannot leave palace)' };
            }
        } else {
            return { valid: false, error: '将帅只能走一步 (King must move 1 step orthogonally)' };
        }
        break;
  
      case 'a': // Advisor
          // 1 step diagonal
          if (absDr === 1 && absDc === 1) {
              // Check Palace
              if (to.col < 3 || to.col > 5) return { valid: false, error: '士不能出九宫 (Advisor cannot leave palace)' };
              if (piece.color === 'w') {
                  if (to.row < 7 || to.row > 9) return { valid: false, error: '仕不能出九宫 (Red Advisor cannot leave palace)' };
              } else {
                  if (to.row < 0 || to.row > 2) return { valid: false, error: '士不能出九宫 (Black Advisor cannot leave palace)' };
              }
          } else {
              return { valid: false, error: '士只能走斜线 (Advisor must move 1 step diagonally)' };
          }
          break;
  
      case 'b': // Bishop / Elephant
          // 2 steps diagonal
          if (absDr === 2 && absDc === 2) {
              // Check River
              if (piece.color === 'w') {
                  if (to.row < 5) return { valid: false, error: '相不能过河 (Red Bishop cannot cross river)' };
              } else {
                  if (to.row > 4) return { valid: false, error: '象不能过河 (Black Bishop cannot cross river)' };
              }
              // Check Eye (Block)
              const eyeR = from.row + dr / 2;
              const eyeC = from.col + dc / 2;
              if (board[eyeR][eyeC]) return { valid: false, error: '塞象眼 (Elephant eye is blocked)' };
          } else {
              return { valid: false, error: '相/象只能走田字 (Bishop must move 2 steps diagonally)' };
          }
          break;
          
      case 'n': // Knight / Horse
          // L-shape: 2+1 or 1+2
          if (!((absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2))) {
               return { valid: false, error: '马只能走日字 (Knight must move in L-shape)' };
          }
          // Check Leg (Block)
          if (absDr === 2) {
              const legR = from.row + (dr > 0 ? 1 : -1);
              if (board[legR][from.col]) return { valid: false, error: '别马腿 (Knight leg is blocked)' };
          } else {
              const legC = from.col + (dc > 0 ? 1 : -1);
              if (board[from.row][legC]) return { valid: false, error: '别马腿 (Knight leg is blocked)' };
          }
          break;
  
      case 'r': // Rook
          if (from.row !== to.row && from.col !== to.col) return { valid: false, error: '车只能走直线 (Rook must move straight)' };
          // Check obstruction
          if (!checkPathClear(board, from, to)) return { valid: false, error: '车路受阻 (Rook path is blocked)' };
          break;
  
      case 'c': // Cannon
          if (from.row !== to.row && from.col !== to.col) return { valid: false, error: '炮只能走直线 (Cannon must move straight)' };
          const piecesBetween = countPiecesBetween(board, from, to);
          if (target) {
              // Capture: must have exactly 1 piece between (screen)
              if (piecesBetween !== 1) return { valid: false, error: '炮吃子需要一个炮架 (Cannon needs 1 screen to capture)' };
          } else {
              // Move: must have 0 pieces between
              if (piecesBetween !== 0) return { valid: false, error: '炮路受阻 (Cannon path is blocked)' };
          }
          break;
  
      case 'p': // Pawn
          // Red moves UP (-1), Black moves DOWN (+1)
          const forward = piece.color === 'w' ? -1 : 1;
          
          // Before river: only forward
          // After river: forward or sideways
          const isCrossedRiver = piece.color === 'w' ? from.row <= 4 : from.row >= 5;
          
          if (isCrossedRiver) {
              // Allow forward or sideways
              // Forward: dr == forward, dc == 0
              // Sideways: dr == 0, absDc == 1
              const isForward = dr === forward && dc === 0;
              const isSideways = dr === 0 && absDc === 1;
              if (!isForward && !isSideways) return { valid: false, error: '过河兵只能向前或向左右移动 (Pawn can only move forward or sideways after crossing river)' };
          } else {
              // Only forward
              if (dr !== forward || dc !== 0) return { valid: false, error: '兵只能向前移动 (Pawn can only move forward before crossing river)' };
          }
          break;
    }
    
    // 3. Check Flying General (Simulate Move)
    const nextBoard = board.map(row => [...row]);
    nextBoard[to.row][to.col] = piece;
    nextBoard[from.row][from.col] = null;
    
    if (isFlyingGeneral(nextBoard)) {
         return { valid: false, error: '将帅照面 (Flying General)' };
    }
  
    return { valid: true };
}

function countPiecesBetween(board: BoardState, from: { row: number, col: number }, to: { row: number, col: number }): number {
    let count = 0;
    if (from.row === to.row) {
        const minC = Math.min(from.col, to.col);
        const maxC = Math.max(from.col, to.col);
        for (let c = minC + 1; c < maxC; c++) {
            if (board[from.row][c]) count++;
        }
    } else {
        const minR = Math.min(from.row, to.row);
        const maxR = Math.max(from.row, to.row);
        for (let r = minR + 1; r < maxR; r++) {
            if (board[r][from.col]) count++;
        }
    }
    return count;
}

function checkPathClear(board: BoardState, from: { row: number, col: number }, to: { row: number, col: number }): boolean {
    return countPiecesBetween(board, from, to) === 0;
}

function isFlyingGeneral(board: BoardState): boolean {
    let redKing: { row: number, col: number } | null = null;
    let blackKing: { row: number, col: number } | null = null;
    
    // Scan palace areas for Kings
    // Red Palace: 7-9, 3-5
    for(let r=7; r<=9; r++) {
        for(let c=3; c<=5; c++) {
            const p = board[r][c];
            if (p && p.type === 'k' && p.color === 'w') {
                redKing = { row: r, col: c };
                break;
            }
        }
    }
    // Black Palace: 0-2, 3-5
    for(let r=0; r<=2; r++) {
        for(let c=3; c<=5; c++) {
            const p = board[r][c];
            if (p && p.type === 'k' && p.color === 'b') {
                blackKing = { row: r, col: c };
                break;
            }
        }
    }
    
    if (redKing && blackKing && redKing.col === blackKing.col) {
        return countPiecesBetween(board, redKing, blackKing) === 0;
    }
    return false;
}

export function parseFen(fen: string): { board: BoardState, turn: PieceColor } {
  const [position, turn] = fen.split(' ');
  const rows = position.split('/');
  const board: BoardState = [];

  for (let r = 0; r < 10; r++) {
    const rowStr = rows[r];
    const row: (Piece | null)[] = [];
    for (let i = 0; i < rowStr.length; i++) {
      const char = rowStr[i];
      if (/\d/.test(char)) {
        const emptyCount = parseInt(char);
        for (let j = 0; j < emptyCount; j++) {
          row.push(null);
        }
      } else {
        const color = char === char.toUpperCase() ? 'w' : 'b';
        const type = char.toLowerCase() as PieceType;
        row.push({ color, type });
      }
    }
    board.push(row);
  }

  return { board, turn: turn as PieceColor };
}

export function generateFen(board: BoardState, turn: PieceColor): string {
  let fen = '';
  for (let r = 0; r < 10; r++) {
    let emptyCount = 0;
    for (let c = 0; c < 9; c++) {
      const piece = board[r][c];
      if (piece) {
        if (emptyCount > 0) {
          fen += emptyCount;
          emptyCount = 0;
        }
        const char = piece.type;
        fen += isRed(piece.color) ? char.toUpperCase() : char.toLowerCase();
      } else {
        emptyCount++;
      }
    }
    if (emptyCount > 0) fen += emptyCount;
    if (r < 9) fen += '/';
  }
  return `${fen} ${turn} - - 0 1`;
}

export function toUciMove(from: { row: number, col: number }, to: { row: number, col: number }): string {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  // Visual Row 0 (Top, Black) -> Rank 9
  // Visual Row 9 (Bottom, Red) -> Rank 0
  const fFile = files[from.col];
  const fRank = 9 - from.row;
  const tFile = files[to.col];
  const tRank = 9 - to.row;
  return `${fFile}${fRank}${tFile}${tRank}`;
}

export function fromUciMove(move: string): { from: { row: number, col: number }, to: { row: number, col: number } } {
  const files = {'a': 0, 'b': 1, 'c': 2, 'd': 3, 'e': 4, 'f': 5, 'g': 6, 'h': 7, 'i': 8};
  
  const fCol = files[move[0] as keyof typeof files];
  const fRow = 9 - parseInt(move[1]);
  const tCol = files[move[2] as keyof typeof files];
  const tRow = 9 - parseInt(move[3]);
  
  return { from: { row: fRow, col: fCol }, to: { row: tRow, col: tCol } };
}

export function isRed(color: PieceColor) {
  return color === 'w';
}

export function getPieceName(type: PieceType, color: PieceColor): string {
  const names = {
    k: { w: '帅', b: '将' },
    a: { w: '仕', b: '士' },
    b: { w: '相', b: '象' },
    n: { w: '马', b: '马' },
    r: { w: '车', b: '车' },
    c: { w: '炮', b: '炮' },
    p: { w: '兵', b: '卒' },
  };
  return names[type][color];
}

export function getChineseMoveNotation(board: BoardState, move: { from: { row: number, col: number }, to: { row: number, col: number } }): string {
  const piece = board[move.from.row][move.from.col];
  if (!piece) return '';

  const isRedTurn = isRed(piece.color);
  const fromCol = move.from.col;
  const toCol = move.to.col;
  const fromRow = move.from.row;
  const toRow = move.to.row;

  // 1. Determine Piece Name
  const pieceName = getPieceName(piece.type, piece.color);

  // 2. Determine File Number (column)
  // Red: 9-col (0->九, 8->一)
  // Black: col+1 (0->1, 8->9)
  const redCols = ['九', '八', '七', '六', '五', '四', '三', '二', '一'];
  const blackCols = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  const getColName = (c: number, color: PieceColor) => isRed(color) ? redCols[c] : blackCols[c];
  
  // 3. Check for Ambiguity (Same piece on same file)
  // Simple check for 2 pieces. Complex cases (3+ pawns) simplified.
  let prefix = '';
  let fileChar = getColName(fromCol, piece.color);

  // Find other pieces of same type and color in same column
  const otherPiecesInCol: number[] = [];
  for (let r = 0; r < 10; r++) {
    if (r === fromRow) continue;
    const p = board[r][fromCol];
    if (p && p.type === piece.type && p.color === piece.color) {
      otherPiecesInCol.push(r);
    }
  }

  if (otherPiecesInCol.length > 0) {
    // Ambiguity exists
    // For multiple pieces (e.g., pawns), we need to sort them by row
    const allPiecesInCol = [...otherPiecesInCol, fromRow].sort((a, b) => a - b);
    
    // Red attacks UP (0), so smaller row is Front
    // Black attacks DOWN (9), so larger row is Front
    
    if (allPiecesInCol.length === 2) {
        // Standard 2-piece ambiguity
        const otherRow = otherPiecesInCol[0];
        const isFront = isRedTurn ? fromRow < otherRow : fromRow > otherRow;
        prefix = isFront ? '前' : '后';
        // Format: "前/后" + "Piece" + "Dir" + "Dest"
        // So we don't use fileChar (SrcCol) here.
    } else if (allPiecesInCol.length === 3) {
        // 3 pieces (Pawns)
        // Red: 0(Front), 1(Mid), 2(Rear)
        // Black: 9(Front), 8(Mid), 7(Rear)
        
        let index = allPiecesInCol.indexOf(fromRow);
        // If Black, reverse index to match Front/Mid/Rear logic?
        // No, let's just define explicitly.
        
        if (isRedTurn) {
            // Smaller row is Front. Index 0 is Front.
            if (index === 0) prefix = '前';
            else if (index === 1) prefix = '中';
            else prefix = '后';
        } else {
            // Larger row is Front. Index len-1 is Front.
            if (index === 2) prefix = '前';
            else if (index === 1) prefix = '中';
            else prefix = '后';
        }
    } else {
        // 4+ pieces... rare. Just use row number fallback or simplified.
        // For simplicity, treat as Front/Back of the group?
        // Let's stick to simple Front/Back relative to the nearest neighbor if needed, but '中' covers 3.
        // If 4, "前二", "前三"? Too complex for this snippet.
        // Fallback: Use standard notation with column, ignoring ambiguity prefix if too complex?
        // Or just "前" for top half, "后" for bottom half?
        // Let's just use column notation if > 3.
        if (allPiecesInCol.length > 3) {
             // Fallback to standard "Piece + Col + Dir + Dest"
             // But we need to distinguish.
             // Actually, standard notation for 4/5 pawns is "前兵", "二兵", "三兵", "四兵", "后兵".
             // We will implement simple 1-3 support.
             prefix = ''; 
        }
    }
  } else {
    prefix = pieceName; // Start with Piece Name
  }
  
  // 4. Determine Direction (进, 退, 平)
  let dir = '';
  // Red (Moves UP to 0): toRow < fromRow -> Advance
  // Black (Moves DOWN to 9): toRow > fromRow -> Advance
  const isAdvance = isRedTurn ? (toRow < fromRow) : (toRow > fromRow);
  const isRetreat = isRedTurn ? (toRow > fromRow) : (toRow < fromRow);
  
  if (toRow === fromRow) {
    dir = '平';
  } else if (isAdvance) {
    dir = '进';
  } else {
    dir = '退';
  }

  // 5. Determine Destination/Distance
  let dest = '';
  
  // Straight moving pieces (Rook, Cannon, Pawn, King) use Distance for Advance/Retreat
  // Diagonal pieces (Knight, Bishop, Advisor) use Destination Column
  const isStraight = ['r', 'c', 'p', 'k'].includes(piece.type);
  
  if (dir === '平') {
    // Always destination column
    dest = getColName(toCol, piece.color);
  } else {
    if (isStraight) {
      // Distance
      const dist = Math.abs(toRow - fromRow);
      // Red uses Chinese numbers, Black uses Arabic
      // Special case: For Black, standard notation uses Arabic for everything.
      // For Red, standard uses Chinese for everything.
      dest = isRedTurn ? redCols[9 - dist] : dist.toString(); // redCols index: 0->九... 8->一. We need 1->一. 
      // redCols: ['九', '八', '七', '六', '五', '四', '三', '二', '一']
      // Index 8 is '一'. Index 8 = 9 - 1.
      // So map distance d (1..9) to redCols[9-d].
    } else {
      // Diagonal: Destination Column
      dest = getColName(toCol, piece.color);
    }
  }
  
  // Final Assembly
  // If prefix was used (Ambiguity), format is: "Prefix" + "Piece" + "Dir" + "Dest"
  // Wait. Standard is "前炮平五". 
  // If prefix is set to '前'/'后', we replaced 'fileChar' with 'PieceName' in the logic above?
  // Let's re-verify.
  // Normal: "炮" + "二" + "平" + "五" (Piece + SrcCol + Dir + Dest)
  // Ambiguous: "前" + "炮" + "平" + "五" (Pos + Piece + Dir + Dest)
  
  if (['前', '后', '中'].includes(prefix)) {
      return prefix + pieceName + dir + dest;
  } else {
      return pieceName + fileChar + dir + dest;
  }
}
