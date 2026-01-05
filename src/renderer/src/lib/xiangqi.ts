
export type PieceColor = 'w' | 'b'; // w=Red(White in FEN), b=Black
export type PieceType = 'k' | 'a' | 'b' | 'n' | 'r' | 'c' | 'p'; // King, Advisor, Bishop, Knight, Rook, Cannon, Pawn

export interface Piece {
  color: PieceColor;
  type: PieceType;
}

export type BoardState = (Piece | null)[][]; // 10 rows, 9 cols

export const START_FEN = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";

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
