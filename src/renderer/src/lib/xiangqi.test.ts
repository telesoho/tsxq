import { describe, it, expect } from 'vitest';
import { validateFen, START_FEN } from './xiangqi';

describe('Xiangqi Validation Logic', () => {
  
  it('should validate the starting position as valid', () => {
    const result = validateFen(START_FEN);
    expect(result.valid).toBe(true);
  });

  it('should detect missing Red King', () => {
    // Replace Red King (K) with empty space (1)
    // START_FEN last row: RNBAKABNR -> RNBA1ABNR
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBA1ABNR w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('缺少红帅');
  });

  it('should detect missing Black King', () => {
    // Replace Black King (k) with empty space (1)
    // START_FEN first row: rnbakabnr -> rnba1abnr
    const fen = "rnba1abnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('缺少黑将');
  });

  it('should detect multiple Kings', () => {
    // Add another Red King
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBAKABNR w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('红帅多于1个');
  });

  it('should detect too many pieces (e.g. 3 Rooks)', () => {
    // Add a Red Rook (R) somewhere
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4R4/RNBAKABNR w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('红车多于2个');
  });

  it('should detect invalid Pawn position (Red Pawn behind start line)', () => {
    // Place Red Pawn (P) at row 8 (second to last)
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4P4/RNBAKABNR w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('红兵位置错误');
  });

  it('should detect invalid Pawn position (Black Pawn behind start line)', () => {
    // Place Black Pawn (p) at row 1 (second row)
    const fen = "rnbakabnr/4p4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('黑卒位置错误');
  });

  it('should detect invalid King position (outside palace)', () => {
    // Move Red King to (0,0) - impossible for Red King, but let's say outside palace at row 9 col 0
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/K8 w - - 0 1";
    // Wait, row 9 is RNBAKABNR. K is at col 4.
    // Let's put K at col 0 (file 9).
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
    // Red Bishop (B) at row 4 (Black side of river)
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/4B4/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('红相位置错误');
  });

  it('should detect Flying General (Kings facing each other)', () => {
    // Clear the board except Kings facing each other
    // Black King at (0, 4), Red King at (9, 4). Empty between.
    const fen = "4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('将帅照面');
  });

  it('should allow Kings facing each other if there is an obstacle', () => {
    // Obstacle (Pawn) at (5, 4)
    const fen = "4k4/9/9/9/9/4P4/9/9/9/4K4 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(true);
  });

  it('should detect Red Pawn on odd file before river', () => {
    // Red Pawn (P) at Row 5, Col 1 (Odd file)
    // Row 5 is 6th row from top. 
    // FEN: .../1P7/...
    const fen = "4k4/9/9/9/9/1P7/9/9/9/4K4 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('红兵位置错误');
  });

  it('should detect Black Pawn on odd file before river', () => {
    // Black Pawn (p) at Row 4, Col 1 (Odd file)
    // Row 4 is 5th row from top.
    const fen = "4k4/9/9/9/1p7/9/9/9/9/4K4 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('黑卒位置错误');
  });

  it('should allow Red Pawn on even file before river', () => {
    // Red Pawn (P) at Row 5, Col 4 (Even file). Blocks Kings.
    const fen = "4k4/9/9/9/9/4P4/9/9/9/4K4 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(true);
  });

  it('should allow Black Pawn on even file before river', () => {
    // Black Pawn (p) at Row 4, Col 4 (Even file). Blocks Kings.
    const fen = "4k4/9/9/9/4p4/9/9/9/9/4K4 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(true);
  });

  it('should allow Red Pawn on odd file after river', () => {
    // Red Pawn (P) at Row 4 (Crossed river), Col 1 (Odd file)
    // Kings offset to avoid Flying General
    const fen = "3k5/9/9/9/1P7/9/9/9/9/5K3 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(true);
  });

  it('should allow Black Pawn on odd file after river', () => {
    // Black Pawn (p) at Row 5 (Crossed river), Col 1 (Odd file)
    // Kings offset to avoid Flying General
    const fen = "3k5/9/9/9/9/1p7/9/9/9/5K3 w - - 0 1";
    const result = validateFen(fen);
    expect(result.valid).toBe(true);
  });
});
