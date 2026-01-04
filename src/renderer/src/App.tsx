import { useState, useEffect, useCallback } from 'react'
import { Board } from './components/Board'
import { ScreenCapture } from './components/ScreenCapture'
import { parseFen, generateFen, START_FEN, BoardState, PieceColor, fromUciMove, getChineseMoveNotation } from './lib/xiangqi'

function App(): JSX.Element {
  const [fen, setFen] = useState(START_FEN);
  const [boardState, setBoardState] = useState<{ board: BoardState, turn: PieceColor }>(parseFen(START_FEN));
  const [selectedSquare, setSelectedSquare] = useState<{ row: number, col: number } | null>(null);
  const [lastMove, setLastMove] = useState<{ from: { row: number, col: number }, to: { row: number, col: number } } | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [history, setHistory] = useState<Array<{
    fen: string,
    lastMove: { from: { row: number, col: number }, to: { row: number, col: number } } | null
  }>>([]);
  
  const [engineStatus, setEngineStatus] = useState<string>('Disconnected');
  const [engineInfo, setEngineInfo] = useState<any>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [gameOver, setGameOver] = useState<string | null>(null);
  const [isCheckingRule, setIsCheckingRule] = useState(false);
  
  // Ref to track latest value of isCheckingRule in async callbacks
  // (Though with proper dependency arrays, we might not strictly need it, but it's safer for race conditions)
  // Actually, since we put isCheckingRule in the dependency array of onBestMove effect, 
  // the effect will re-run when it changes. This is fine.

  const [showCapture, setShowCapture] = useState(false);

  // Initialize Engine
  useEffect(() => {
    window.api.onEngineStatus((status) => setEngineStatus(status));
    window.api.onEngineInfo((info) => setEngineInfo(info));
    
    window.api.startEngine().then(success => {
      if (success) {
        setEngineStatus('Ready');
        window.api.sendToEngine('uci');
      } else {
        setEngineStatus('Failed to start (Check resources/bin/pikafish.exe)');
      }
    });
  }, []);

  // Update internal state when FEN changes
  useEffect(() => {
    const parsed = parseFen(fen);
    setBoardState(parsed);
    
    // If it's AI's turn (Black), ask engine to move
    if (parsed.turn === 'b' && engineStatus.toLowerCase() === 'ready' && !isAiThinking && !gameOver) {
      setIsAiThinking(true);
      window.api.sendToEngine(`position fen ${fen}`);
      window.api.sendToEngine('go movetime 1000'); // 1 second think time
    } else if (parsed.turn === 'w' && engineStatus.toLowerCase() === 'ready' && !gameOver) {
      // Check if Human (Red) is checkmated or stalemated
      setIsCheckingRule(true);
      window.api.sendToEngine(`position fen ${fen}`);
      window.api.sendToEngine('go depth 1');
    }
  }, [fen, engineStatus, isAiThinking, gameOver]);

  const applyMove = useCallback((from: { row: number, col: number }, to: { row: number, col: number }) => {
    // Generate notation before modifying the board
    const notation = getChineseMoveNotation(boardState.board, { from, to });
    
    // Save current state to history before modifying
    setHistory(prev => [...prev, { fen, lastMove }]);

    const newBoard = [...boardState.board.map(r => [...r])];
    newBoard[to.row][to.col] = newBoard[from.row][from.col];
    newBoard[from.row][from.col] = null;
    
    const nextTurn = boardState.turn === 'w' ? 'b' : 'w';
    const newFen = generateFen(newBoard, nextTurn);
    
    setLastMove({ from, to });
    setMoveHistory(prev => [...prev, notation]);
    setFen(newFen);
  }, [boardState, fen, lastMove]);

  const handleUndo = () => {
    if (history.length === 0) return;

    // If AI is thinking (User just moved, Red -> Black)
    if (isAiThinking) {
        // Cancel AI
        setIsAiThinking(false);
        window.api.sendToEngine('stop');
        
        // Undo 1 step (Red's move)
        const prevState = history[history.length - 1];
        setFen(prevState.fen);
        setLastMove(prevState.lastMove);
        setHistory(prev => prev.slice(0, -1));
        setMoveHistory(prev => prev.slice(0, -1));
        return;
    }

    // If it is Red's turn (User turn), we usually want to undo 2 steps (AI move + User move)
    // to let User retry.
    // Unless history has only 1 step (e.g. User moved, AI didn't move yet? But handled above).
    if (boardState.turn === 'w') {
        if (history.length >= 2) {
            const prevState = history[history.length - 2];
            setFen(prevState.fen);
            setLastMove(prevState.lastMove);
            setHistory(prev => prev.slice(0, -2));
            setMoveHistory(prev => prev.slice(0, -2));
            setGameOver(null); // Clear game over if any
        } else if (history.length === 1) {
            // Should not happen if AI moves automatically, but just in case
            const prevState = history[0];
            setFen(prevState.fen);
            setLastMove(prevState.lastMove);
            setHistory([]);
            setMoveHistory([]);
            setGameOver(null);
        }
    }
  };

  // Handle AI Best Move
  useEffect(() => {
    const cleanup = window.api.onBestMove((moveStr) => {
      console.log('Best move received:', moveStr, 'isCheckingRule:', isCheckingRule);
      
      if (isCheckingRule) {
        setIsCheckingRule(false);
        // If we are just checking rules (Red turn)
        if (!moveStr || moveStr === '(none)') {
          setGameOver('Black Wins! (Red has no legal moves)');
        }
        return;
      }

      // If we are not expecting AI to move (e.g. cancelled by Undo), ignore
      if (!isAiThinking) return;

      setIsAiThinking(false);
      if (moveStr && moveStr !== '(none)') {
        // Apply AI move
        const move = fromUciMove(moveStr);
        applyMove(move.from, move.to);
      } else {
        // AI has no moves (Black stalemated/mated)
        setGameOver('Red Wins! (Black has no legal moves)');
      }
    });
    return cleanup;
  }, [applyMove, isCheckingRule, isAiThinking]);

  const handleSquareClick = (row: number, col: number) => {
    if (gameOver) return;

    const piece = boardState.board[row][col];
    const isMyTurn = boardState.turn === 'w'; // Human is Red (w)

    if (!isMyTurn) return; // Wait for AI

    if (selectedSquare) {
      // Move attempt
      if (selectedSquare.row === row && selectedSquare.col === col) {
        setSelectedSquare(null); // Deselect
        return;
      }

      // Basic validation: ensure we aren't eating our own pieces
      if (piece && (piece.color === boardState.board[selectedSquare.row][selectedSquare.col]?.color)) {
         // Reselect if clicking own piece
         setSelectedSquare({ row, col });
         return;
      }

      // Apply move locally
      applyMove(selectedSquare, { row, col });
      setSelectedSquare(null);
    } else {
      // Select
      if (piece && piece.color === 'w') { // Only select own pieces
        setSelectedSquare({ row, col });
      }
    }
  };

  return (
    <div className="flex h-screen bg-stone-200 p-8 gap-8">
      <div className="flex-1 flex justify-center items-center">
        <Board 
          board={boardState.board} 
          onSquareClick={handleSquareClick} 
          selectedSquare={selectedSquare}
          lastMove={lastMove}
        />
      </div>
      <div className="w-80 bg-white p-4 rounded-lg shadow-lg flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-stone-800">Xiangqi Assistant</h1>
        
        <div className={`p-4 rounded ${engineStatus.includes('Failed') ? 'bg-red-100 text-red-800' : 'bg-gray-100'}`}>
          <h2 className="font-bold mb-2">Engine</h2>
          <p className="text-sm">{engineStatus}</p>
          {isAiThinking && <p className="text-blue-600 font-bold animate-pulse">AI is thinking...</p>}
          {gameOver && <p className="text-red-600 font-bold text-lg mt-2">{gameOver}</p>}
        </div>

        {engineInfo && (
          <div className="p-4 bg-blue-50 rounded text-sm">
            <p><strong>Depth:</strong> {engineInfo.depth}</p>
            <p><strong>Score:</strong> {engineInfo.scoreType} {engineInfo.scoreValue}</p>
            <p className="truncate" title={engineInfo.pv}><strong>PV:</strong> {engineInfo.pv}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button 
            onClick={() => {
              setFen(START_FEN);
              setGameOver(null);
              setIsCheckingRule(false);
              setIsAiThinking(false);
              setEngineInfo(null);
              setMoveHistory([]);
              setHistory([]);
              setLastMove(null);
            }}
            className="flex-1 px-4 py-2 bg-stone-600 text-white rounded hover:bg-stone-700 font-bold shadow-sm"
          >
            重新开始
          </button>
          <button 
            onClick={handleUndo}
            disabled={history.length === 0}
            className={`flex-1 px-4 py-2 rounded font-bold shadow-sm ${
              history.length === 0 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-amber-600 text-white hover:bg-amber-700'
            }`}
          >
            悔棋
          </button>
        </div>
        
        <div className="flex-1 overflow-auto bg-gray-50 rounded p-2 text-sm font-mono flex flex-col-reverse">
           <div className="mt-2 pt-2 border-t border-gray-200">
              <p className="text-gray-500 text-xs">FEN: {fen}</p>
           </div>
           <div className="flex flex-col gap-1">
              {moveHistory.map((move, i) => (
                <div key={i} className="flex justify-between text-stone-700">
                   <span className="w-8 text-gray-400">{i + 1}.</span>
                   <span className="font-bold">{move}</span>
                </div>
              ))}
              {moveHistory.length === 0 && <p className="text-gray-400 text-center italic">Game Start</p>}
           </div>
        </div>
      </div>
      {showCapture && (
        <ScreenCapture 
          onCancel={() => setShowCapture(false)}
          onCapture={(imageData) => {
            setShowCapture(false);
            console.log('Captured image data length:', imageData.length);
            // TODO: Implement OCR/Recognition logic here
            // For now, just mock it by setting a random FEN or keeping current
            alert('Screen captured! (Recognition logic to be implemented)');
          }}
        />
      )}
    </div>
  )
}

export default App
