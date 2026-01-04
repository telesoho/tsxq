import { useState, useEffect, useCallback, useRef, SetStateAction } from 'react'
import { Board } from './components/Board'
import { ScreenCapture } from './components/ScreenCapture'
import { parseFen, generateFen, START_FEN, BoardState, PieceColor, PieceType, fromUciMove, getChineseMoveNotation } from './lib/xiangqi'

import { BoardCalibration } from './components/BoardCalibration'
import { recognizeBoardWithCorners, learnPiece, getSquareImage, BoardCorners } from './lib/vision'
import { captureSource } from './lib/capture'

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
  
  const [showCapture, setShowCapture] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);

  // Refs for state access in callbacks without triggering re-renders/re-binding
  const isAiThinkingRef = useRef(isAiThinking);
  const isCheckingRuleRef = useRef(isCheckingRule);
  const gameOverRef = useRef(gameOver);

  useEffect(() => { isAiThinkingRef.current = isAiThinking; }, [isAiThinking]);
  useEffect(() => { isCheckingRuleRef.current = isCheckingRule; }, [isCheckingRule]);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);

  // User Preferences
  const [userColor, setUserColor] = useState<PieceColor>('w'); // 'w' = Red, 'b' = Black

  // Correction Mode State
  const [lastRecognizedImage, setLastRecognizedImage] = useState<string | null>(null);
  const [lastCorners, setLastCorners] = useState<BoardCorners | null>(null);
  const [lastSourceId, setLastSourceId] = useState<string | null>(null);
  const [tempSourceId, setTempSourceId] = useState<string | null>(null);
  const [isCorrectionMode, setIsCorrectionMode] = useState(false);
  const [editingSquare, setEditingSquare] = useState<{ row: number, col: number } | null>(null);
  const [editingSquareImage, setEditingSquareImage] = useState<string | null>(null);

  // Load saved corners
  useEffect(() => {
    try {
        const saved = localStorage.getItem('board_corners');
        if (saved) {
            setLastCorners(JSON.parse(saved));
        }
    } catch (e) {
        console.error('Failed to load saved corners', e);
    }
  }, []);

  // Initialize Engine
  useEffect(() => {
    const cleanupStatus = window.api.onEngineStatus((status: SetStateAction<string>) => setEngineStatus(status));
    const cleanupInfo = window.api.onEngineInfo((info: any) => setEngineInfo(info));
    
    window.api.startEngine().then((success: any) => {
      if (success) {
        setEngineStatus('Ready');
        window.api.sendToEngine('uci');
      } else {
        setEngineStatus('Failed to start (Check resources/bin/pikafish.exe)');
      }
    });

    return () => {
        cleanupStatus();
        cleanupInfo();
    };
  }, []);

  // Update internal state when FEN changes
  useEffect(() => {
    const parsed = parseFen(fen);
    setBoardState(parsed);
    
    // If it's AI's turn (Not User Color), ask engine to move
    if (parsed.turn !== userColor && engineStatus.toLowerCase() === 'ready' && !isAiThinking && !gameOver) {
      setIsAiThinking(true);
      window.api.sendToEngine(`position fen ${fen}`);
      window.api.sendToEngine('go movetime 1000'); // 1 second think time
    } else if (parsed.turn === userColor && engineStatus.toLowerCase() === 'ready' && !gameOver) {
      // Check if Human is checkmated or stalemated
      setIsCheckingRule(true);
      window.api.sendToEngine(`position fen ${fen}`);
      window.api.sendToEngine('go depth 1');
    }
  }, [fen, engineStatus, isAiThinking, gameOver, userColor]);

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

    // If it is User's turn, we usually want to undo 2 steps (AI move + User move)
    // to let User retry.
    // Unless history has only 1 step (e.g. User moved, AI didn't move yet? But handled above).
    if (boardState.turn === userColor) {
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
    const cleanup = window.api.onBestMove((moveStr: string) => {
      console.log('Best move received:', moveStr, 'isCheckingRule:', isCheckingRuleRef.current);
      
      if (isCheckingRuleRef.current) {
        setIsCheckingRule(false);
        // If we are just checking rules (Red turn)
        if (!moveStr || moveStr === '(none)') {
          setGameOver('User Lost! (No legal moves)');
        }
        return;
      }

      // If we are not expecting AI to move (e.g. cancelled by Undo), ignore
      if (!isAiThinkingRef.current) return;

      setIsAiThinking(false);
      if (moveStr && moveStr !== '(none)') {
        // Apply AI move
        const move = fromUciMove(moveStr);
        applyMove(move.from, move.to);
      } else {
        // AI has no moves (User wins)
        setGameOver('User Wins! (AI has no legal moves)');
      }
    });
    return cleanup;
  }, [applyMove]);

  // AI Watchdog to prevent stuck state
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isAiThinking) {
        timer = setTimeout(() => {
            if (isAiThinkingRef.current) {
                console.warn('AI thinking timeout, forcing reset');
                setIsAiThinking(false);
                window.api.sendToEngine('stop');
                setEngineStatus('Ready (Reset after timeout)');
            }
        }, 5000); // 5 seconds timeout
    }
    return () => clearTimeout(timer);
  }, [isAiThinking]);

  const handleReRecognize = async () => {
    if (!lastCorners) return;
    
    setIsRecognizing(true);
    try {
        let imageToProcess = lastRecognizedImage;
        
        // If we have a source ID, try to capture a fresh image
        if (lastSourceId) {
            try {
                const freshImage = await captureSource(lastSourceId);
                imageToProcess = freshImage;
                setLastRecognizedImage(freshImage); // Update cached image
            } catch(e) {
                console.warn('Failed to re-capture source, using last cached image', e);
                // Fallback to lastRecognizedImage
            }
        }

        if (!imageToProcess) throw new Error('No image to process');

        const board = await recognizeBoardWithCorners(imageToProcess, lastCorners, (r, c, img) => {
             console.log(`%c [${r},${c}]`, `background-image: url(${img}); background-size: contain; background-repeat: no-repeat; padding: 20px; color: transparent;`);
        });
        
        setBoardState({ board, turn: 'w' });
        const newFen = generateFen(board, 'w');
        setFen(newFen);
        setMoveHistory([]);
        setHistory([]);
        setLastMove(null);
        setGameOver(null);
    } catch(e) {
        console.error(e);
        alert('Re-recognition failed: ' + e);
    } finally {
        setIsRecognizing(false);
    }
  };

  const handlePieceCorrection = async (piece: { type: PieceType, color: PieceColor } | null) => {
    if (!editingSquare || !lastRecognizedImage || !lastCorners) return;
    
    const { row, col } = editingSquare;
    
    setEditingSquare(null);
    setIsRecognizing(true);

    try {
        // Always learn, even if piece is null (Empty)
        await learnPiece(lastRecognizedImage, lastCorners, row, col, piece);
        
        const board = await recognizeBoardWithCorners(lastRecognizedImage, lastCorners, (r, c, img) => {
             console.log(`%c [${r},${c}]`, `background-image: url(${img}); background-size: contain; background-repeat: no-repeat; padding: 20px; color: transparent;`);
        });
        
        setBoardState({ board, turn: 'w' });
        const newFen = generateFen(board, 'w');
        setFen(newFen);
        setMoveHistory([]);
        setHistory([]);
        setLastMove(null);
        setGameOver(null);
    } catch(e) {
        console.error(e);
        alert('Correction failed: ' + e);
    } finally {
        setIsRecognizing(false);
    }
  };

  const handleSquareClick = async (row: number, col: number) => {
    if (isCorrectionMode) {
      setEditingSquare({ row, col });
      if (lastRecognizedImage && lastCorners) {
          try {
             const img = await getSquareImage(lastRecognizedImage, lastCorners, row, col);
             setEditingSquareImage(img);
          } catch(e) {
             console.error('Failed to get square image', e);
             setEditingSquareImage(null);
          }
      }
      return;
    }

    if (gameOver) return;

    const piece = boardState.board[row][col];
    const isMyTurn = boardState.turn === userColor;

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
      if (piece && piece.color === userColor) { // Only select own pieces
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
        
        {/* User Color Selection */}
        <div className="flex bg-gray-100 p-1 rounded-lg">
           <button 
             onClick={() => setUserColor('w')}
             className={`flex-1 py-1 rounded font-bold text-sm transition-colors ${userColor === 'w' ? 'bg-red-600 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}
           >
             执红 (先手)
           </button>
           <button 
             onClick={() => setUserColor('b')}
             className={`flex-1 py-1 rounded font-bold text-sm transition-colors ${userColor === 'b' ? 'bg-black text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}
           >
             执黑 (后手)
           </button>
        </div>

        <div className="flex flex-col gap-2">
            <button
                onClick={() => setShowCapture(true)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold shadow-sm flex items-center justify-center gap-2"
            >
                <span>📷</span> 识别棋盘
            </button>
            
            {lastRecognizedImage && lastCorners && (
                <button
                    onClick={handleReRecognize}
                    disabled={isRecognizing}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-bold shadow-sm flex items-center justify-center gap-2"
                >
                    <span>🔄</span> 重新识别
                </button>
            )}
            
            <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer select-none bg-white p-2 rounded shadow-sm border border-stone-200">
                <input 
                    type="checkbox" 
                    checked={isCorrectionMode}
                    onChange={(e) => setIsCorrectionMode(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span>纠错模式 (点击棋盘修正)</span>
            </label>
        </div>

        <div className={`p-4 rounded ${engineStatus.includes('Failed') ? 'bg-red-100 text-red-800' : 'bg-gray-100'}`}>
          <h2 className="font-bold mb-2">Engine</h2>
          <p className="text-sm">{engineStatus}</p>
          {isAiThinking && <p className="text-blue-600 font-bold animate-pulse">AI is thinking...</p>}
          {isRecognizing && <p className="text-purple-600 font-bold animate-pulse">Recognizing Board...</p>}
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
          onCapture={(imageData, sourceId) => {
            setShowCapture(false);
            setCapturedImage(imageData);
            setTempSourceId(sourceId);
          }}
        />
      )}
      
      {capturedImage && (
        <BoardCalibration
          imageData={capturedImage}
          initialCorners={lastCorners}
          onCancel={() => {
              setCapturedImage(null);
              setTempSourceId(null);
          }}
          onConfirm={async (corners) => {
            setLastRecognizedImage(capturedImage);
            setLastCorners(corners);
            if (tempSourceId) setLastSourceId(tempSourceId);
            localStorage.setItem('board_corners', JSON.stringify(corners));
            setCapturedImage(null);
            setTempSourceId(null);
            setIsRecognizing(true);
            try {
              const board = await recognizeBoardWithCorners(capturedImage, corners, (row, col, debugImg) => {
                 console.log(`%c [${row},${col}]`, `background-image: url(${debugImg}); background-size: contain; background-repeat: no-repeat; padding: 20px; color: transparent;`);
              });
              
              setBoardState({ board, turn: 'w' }); // 'w' is Red in our internal representation
              const newFen = generateFen(board, 'w');
              setFen(newFen);
              setMoveHistory([]); // Clear history on new board
              setHistory([]);
              setLastMove(null);
            } catch (e) {
              console.error(e);
              alert('Recognition failed: ' + e);
            } finally {
              setIsRecognizing(false);
            }
          }}
        />
      )}
      
      {editingSquare && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setEditingSquare(null)}>
            <div className="bg-white p-6 rounded-lg shadow-xl flex flex-col items-center" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold mb-4 text-center">选择正确的棋子</h3>
                
                {editingSquareImage && (
                    <div className="mb-4 border-2 border-blue-500 rounded p-1">
                        <img src={editingSquareImage} alt="Square" className="w-24 h-24 object-contain" />
                    </div>
                )}

                <div className="grid grid-cols-7 gap-2 mb-4">
                    {/* Red Pieces */}
                    {[
                        {l:'車', t:'r', c:'w'}, {l:'馬', t:'n', c:'w'}, {l:'相', t:'b', c:'w'}, 
                        {l:'仕', t:'a', c:'w'}, {l:'帥', t:'k', c:'w'}, {l:'炮', t:'c', c:'w'}, {l:'兵', t:'p', c:'w'}
                    ].map(p => (
                        <button key={'r'+p.l} 
                            onClick={() => handlePieceCorrection({ type: p.t as any, color: p.c as any })} 
                            className="w-10 h-10 text-xl border-2 border-red-500 text-red-600 font-bold rounded-full hover:bg-red-50 flex items-center justify-center"
                        >
                            {p.l}
                        </button>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-2 mb-4">
                    {/* Black Pieces */}
                    {[
                        {l:'車', t:'r', c:'b'}, {l:'馬', t:'n', c:'b'}, {l:'象', t:'b', c:'b'}, 
                        {l:'士', t:'a', c:'b'}, {l:'將', t:'k', c:'b'}, {l:'炮', t:'c', c:'b'}, {l:'卒', t:'p', c:'b'}
                    ].map(p => (
                        <button key={'b'+p.l} 
                            onClick={() => handlePieceCorrection({ type: p.t as any, color: p.c as any })} 
                            className="w-10 h-10 text-xl border-2 border-black text-black font-bold rounded-full hover:bg-gray-100 flex items-center justify-center"
                        >
                            {p.l}
                        </button>
                    ))}
                </div>
                 <div className="flex gap-2 w-full">
                     <button onClick={() => handlePieceCorrection(null)} className="flex-1 py-2 bg-stone-200 rounded hover:bg-stone-300 font-bold text-stone-700 border-2 border-stone-400">
                        空白 (Empty)
                     </button>
                 </div>
            </div>
        </div>
      )}
    </div>
  )
}

export default App
