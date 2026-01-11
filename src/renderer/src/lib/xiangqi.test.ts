import { describe, it, expect } from 'vitest';
import { validateFen, START_FEN, validateMove, parseFen } from './xiangqi';

describe('Xiangqi Validation Logic', () => {
  
  it('should validate the starting position as valid', () => {
    const result = validateFen(START_FEN);
    expect(result.valid).toBe(true);
  });

  it('should detect missing Red King', () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBA1ABNR w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('缺少红帅');
  });

  it('should detect missing Black King', () => {
    const fen = "rnba1abnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('缺少黑将');
  });

  it('should detect multiple Kings', () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBAKABNR w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('红帅多于1个');
  });

  it('should detect too many pieces (e.g. 3 Rooks)', () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4R4/RNBAKABNR w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('红车多于2个');
  });

  it('should detect invalid Pawn position (Red Pawn behind start line)', () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4P4/RNBAKABNR w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('红兵位置错误');
  });

  it('should detect invalid Pawn position (Black Pawn behind start line)', () => {
    const fen = "rnbakabnr/4p4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('黑卒位置错误');
  });

  it('should detect invalid King position (outside palace)', () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/K8 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('红帅位置错误');
  });

  it('should detect invalid Advisor position (outside palace)', () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/A8/RNBAKABNR w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('红仕位置错误');
  });

  it('should detect invalid Bishop position (crossed river)', () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/4B4/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('红相位置错误');
  });

  it('should detect Flying General (Kings facing each other)', () => {
    const fen = "4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('将帅照面');
  });

  it('should allow Kings facing each other if there is an obstacle', () => {
    const fen = "4k4/9/9/9/9/4P4/9/9/9/4K4 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(true);
  });

  it('should detect Red Pawn on odd file before river', () => {
    const fen = "4k4/9/9/9/9/1P7/9/9/9/4K4 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('红兵位置错误');
  });

  it('should detect Black Pawn on odd file before river', () => {
    const fen = "4k4/9/9/9/1p7/9/9/9/9/4K4 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('黑卒位置错误');
  });

  it('should allow Red Pawn on even file before river', () => {
    const fen = "4k4/9/9/9/9/4P4/9/9/9/4K4 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(true);
  });

  it('should allow Black Pawn on even file before river', () => {
    const fen = "4k4/9/9/9/4p4/9/9/9/9/4K4 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(true);
  });

  it('should allow Red Pawn on odd file after river', () => {
    // Offset Kings to avoid Flying General
    const fen = "3k5/9/9/9/1P7/9/9/9/9/5K3 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(true);
  });

  it('should allow Black Pawn on odd file after river', () => {
    // Offset Kings to avoid Flying General
    const fen = "3k5/9/9/9/9/1p7/9/9/9/5K3 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(true);
  });
});

describe('validateMove', () => {
  const getBoard = (fen: string) => parseFen(fen).board;

  // 1. Basic Checks
  it('should prevent moving from empty square', () => {
      const board = getBoard(START_FEN);
      const result = validateMove(board, { from: { row: 1, col: 1 }, to: { row: 2, col: 1 } });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('无棋子');
  });

  it('should prevent moving to same square', () => {
      const board = getBoard(START_FEN);
      const result = validateMove(board, { from: { row: 0, col: 0 }, to: { row: 0, col: 0 } });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('目标位置相同');
  });

  it('should prevent capturing own piece', () => {
      const board = getBoard(START_FEN);
      const result = validateMove(board, { from: { row: 0, col: 0 }, to: { row: 0, col: 1 } });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('不能吃自己的棋子');
  });

  // 2. King (Jiang/Shuai)
  it('should validate King moves correctly', () => {
      // Red King at (9, 4), Black King at (0, 5) (Offset)
      const fen = "5k3/9/9/9/9/9/9/9/9/4K4 w - - 0 1";
      const board = getBoard(fen);
      
      // Valid: Forward
      expect(validateMove(board, { from: { row: 9, col: 4 }, to: { row: 8, col: 4 } }).valid).toBe(true);
      // Valid: Sideways
      expect(validateMove(board, { from: { row: 9, col: 4 }, to: { row: 9, col: 3 } }).valid).toBe(true);
      
      // Invalid: Diagonal
      expect(validateMove(board, { from: { row: 9, col: 4 }, to: { row: 8, col: 3 } }).valid).toBe(false);
      // Invalid: Outside Palace (Col)
      expect(validateMove(board, { from: { row: 9, col: 3 }, to: { row: 9, col: 2 } }).valid).toBe(false);
      
      // Invalid: Outside Palace (Row - assuming moving up from 7)
      // Setup King at (7, 4)
      const board2 = getBoard("3k5/9/9/9/9/9/9/4K4/9/9 w - - 0 1");
      expect(validateMove(board2, { from: { row: 7, col: 4 }, to: { row: 6, col: 4 } }).valid).toBe(false);
  });

  it('should prevent King from facing King (Flying General) on move', () => {
      // Red King (9,4), Black King (0,4). Obstacle (Pawn) at (4,4) (Across river, can move sideways).
      // Move Pawn away.
      const fen = "4k4/9/9/9/4P4/9/9/9/9/4K4 w - - 0 1";
      const board = getBoard(fen);
      
      // Move Pawn from (4,4) to (4,3)
      const result = validateMove(board, { from: { row: 4, col: 4 }, to: { row: 4, col: 3 } });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('将帅照面');
  });

  // 3. Advisor (Shi)
  it('should validate Advisor moves correctly', () => {
      // Red Advisor at (9, 3), Black King at (0, 3) (Offset from Red King)
      const fen = "3k5/9/9/9/9/9/9/9/9/3AK4 w - - 0 1";
      const board = getBoard(fen);
      
      // Valid: Diagonal to center
      expect(validateMove(board, { from: { row: 9, col: 3 }, to: { row: 8, col: 4 } }).valid).toBe(true);
      
      // Invalid: Straight
      expect(validateMove(board, { from: { row: 9, col: 3 }, to: { row: 8, col: 3 } }).valid).toBe(false);
      // Invalid: Out of palace
      expect(validateMove(board, { from: { row: 9, col: 3 }, to: { row: 8, col: 2 } }).valid).toBe(false);
  });

  // 4. Bishop (Xiang/Xiang)
  it('should validate Bishop moves correctly', () => {
      // Red Bishop at (9, 2), Black King at (0, 3)
      const fen = "3k5/9/9/9/9/9/9/9/9/2B1K4 w - - 0 1";
      const board = getBoard(fen);
      
      // Valid: 2 steps diagonal
      expect(validateMove(board, { from: { row: 9, col: 2 }, to: { row: 7, col: 4 } }).valid).toBe(true);
      
      // Invalid: 1 step
      expect(validateMove(board, { from: { row: 9, col: 2 }, to: { row: 8, col: 3 } }).valid).toBe(false);
      // Invalid: Cross river
      const board2 = getBoard("3k5/9/9/9/9/2B6/9/9/9/4K4 w - - 0 1");
      expect(validateMove(board2, { from: { row: 5, col: 2 }, to: { row: 3, col: 4 } }).valid).toBe(false);
  });

  it('should respect Bishop eye (block)', () => {
      // Bishop at (9, 2), Block at (8, 3)
      const fen = "3k5/9/9/9/9/9/9/9/3P5/2B1K4 w - - 0 1";
      const board = getBoard(fen);
      
      expect(validateMove(board, { from: { row: 9, col: 2 }, to: { row: 7, col: 4 } }).valid).toBe(false);
  });

  // 5. Knight (Ma)
  it('should validate Knight moves correctly', () => {
      // Red Knight at (9, 1), Black King at (0, 3)
      const fen = "3k5/9/9/9/9/9/9/9/9/1N2K4 w - - 0 1";
      const board = getBoard(fen);
      
      // Valid: L-shape
      expect(validateMove(board, { from: { row: 9, col: 1 }, to: { row: 7, col: 2 } }).valid).toBe(true);
      expect(validateMove(board, { from: { row: 9, col: 1 }, to: { row: 7, col: 0 } }).valid).toBe(true);
      
      // Invalid: Straight
      expect(validateMove(board, { from: { row: 9, col: 1 }, to: { row: 8, col: 1 } }).valid).toBe(false);
  });

  it('should respect Knight leg (block)', () => {
      // Knight at (9, 1). Block at (8, 1)
      const fen = "3k5/9/9/9/9/9/9/9/1P7/1N2K4 w - - 0 1";
      const board = getBoard(fen);
      
      // Try to move to (7, 2) or (7, 0)
      expect(validateMove(board, { from: { row: 9, col: 1 }, to: { row: 7, col: 2 } }).valid).toBe(false);
  });

  // 6. Rook (Ju)
  it('should validate Rook moves correctly', () => {
      // Rook at (9, 0), Black King at (0, 3)
      const fen = "3k5/9/9/9/9/9/9/9/9/R3K4 w - - 0 1";
      const board = getBoard(fen);
      
      // Valid: Straight
      expect(validateMove(board, { from: { row: 9, col: 0 }, to: { row: 5, col: 0 } }).valid).toBe(true);
      expect(validateMove(board, { from: { row: 9, col: 0 }, to: { row: 9, col: 3 } }).valid).toBe(true);
      
      // Invalid: Diagonal
      expect(validateMove(board, { from: { row: 9, col: 0 }, to: { row: 8, col: 1 } }).valid).toBe(false);
  });

  it('should respect Rook blocking', () => {
      // Rook at (9, 0), Piece at (7, 0)
      const fen = "3k5/9/9/9/9/9/9/P8/9/R3K4 w - - 0 1";
      const board = getBoard(fen);
      
      // Try to move to (6, 0) - blocked
      expect(validateMove(board, { from: { row: 9, col: 0 }, to: { row: 6, col: 0 } }).valid).toBe(false);
  });

  // 7. Cannon (Pao)
  it('should validate Cannon moves correctly', () => {
      // Cannon at (2, 1), Black King at (0, 3)
      // Note: Fen Row 2 is 3rd row (index 2)
      const fen = "3k5/9/1C7/9/9/9/9/9/9/4K4 w - - 0 1";
      const board = getBoard(fen);
      
      // Move: No screen needed
      expect(validateMove(board, { from: { row: 2, col: 1 }, to: { row: 2, col: 5 } }).valid).toBe(true);
  });

  it('should validate Cannon capture correctly', () => {
      // Cannon (Red) at (2, 1). Screen (Black P) at (2, 4). Target (Black R) at (2, 6).
      const fen = "3k5/9/1C2p1r2/9/9/9/9/9/9/4K4 w - - 0 1";
      const board = getBoard(fen);
      
      // Capture with 1 screen: Valid
      expect(validateMove(board, { from: { row: 2, col: 1 }, to: { row: 2, col: 6 } }).valid).toBe(true);
      
      // Move with 1 screen (not capture): Invalid
      expect(validateMove(board, { from: { row: 2, col: 1 }, to: { row: 2, col: 5 } }).valid).toBe(false);
      
      // Capture with 0 screen: Invalid
      expect(validateMove(board, { from: { row: 2, col: 1 }, to: { row: 2, col: 4 } }).valid).toBe(false);
  });

  // 8. Pawn (Bing/Zu)
  it('should validate Pawn moves correctly', () => {
      // Red Pawn at (6, 0) (Before river)
      const fen = "3k5/9/9/9/9/9/P8/9/9/4K4 w - - 0 1";
      const board = getBoard(fen);
      
      // Valid: Forward
      expect(validateMove(board, { from: { row: 6, col: 0 }, to: { row: 5, col: 0 } }).valid).toBe(true);
      // Invalid: Sideways
      expect(validateMove(board, { from: { row: 6, col: 0 }, to: { row: 6, col: 1 } }).valid).toBe(false);
      // Invalid: Backward
      expect(validateMove(board, { from: { row: 6, col: 0 }, to: { row: 7, col: 0 } }).valid).toBe(false);
      
      // Red Pawn at (4, 0) (After river)
      const board2 = getBoard("3k5/9/9/9/P8/9/9/9/9/4K4 w - - 0 1");
      // Valid: Sideways
      expect(validateMove(board2, { from: { row: 4, col: 0 }, to: { row: 4, col: 1 } }).valid).toBe(true);
  });
});
