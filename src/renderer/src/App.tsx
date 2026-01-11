import { useState, useEffect, useCallback, useRef, useMemo, SetStateAction } from 'react'
import { Board } from './components/Board'
import { ScreenCapture } from './components/ScreenCapture'
import { ChessTimer } from './components/ChessTimer'
import { parseFen, generateFen, START_FEN, BoardState, PieceColor, PieceType, fromUciMove, getChineseMoveNotation, validateFen, validateMove } from './lib/xiangqi'
import { recognizeBoardViaApi } from './lib/vision'
import { captureSource } from './lib/capture'

function App(): JSX.Element {
  const [fen, setFen] = useState(START_FEN);
  const boardState = useMemo(() => parseFen(fen), [fen]);
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
  const [isRecognizing, setIsRecognizing] = useState(false);

  // Refs for state access in callbacks without triggering re-renders/re-binding
  const isAiThinkingRef = useRef(isAiThinking);
  const isCheckingRuleRef = useRef(isCheckingRule);
  const gameOverRef = useRef(gameOver);

  useEffect(() => { isAiThinkingRef.current = isAiThinking; }, [isAiThinking]);
  useEffect(() => { isCheckingRuleRef.current = isCheckingRule; }, [isCheckingRule]);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);

  // User Preferences
  const [isRedAi, setIsRedAi] = useState(false);
  const [isBlackAi, setIsBlackAi] = useState(true); // Default: Human Red vs AI Black
  const [isFlipped, setIsFlipped] = useState(false);
  const [aiLimit, setAiLimit] = useState<{ type: 'time' | 'depth', value: number }>({ type: 'time', value: 3000 }); // Default 3s
  
  // Correction Mode State
  const [lastRecognizedImage, setLastRecognizedImage] = useState<string | null>(null);
  const [lastSourceId, setLastSourceId] = useState<string | null>(null);
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  const [showAiHints, setShowAiHints] = useState(true);

  // Simulation Mode State
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [simulationSnapshot, setSimulationSnapshot] = useState<{
      fen: string;
      moveHistory: string[];
      history: any[];
      lastMove: any;
      gameOver: string | null;
      isRedAi: boolean;
      isBlackAi: boolean;
  } | null>(null);

  // Timer State
  const [redTime, setRedTime] = useState(0);
  const [blackTime, setBlackTime] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [activeTimer, setActiveTimer] = useState<'w' | 'b' | null>(null);

  // Timer Tick Effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerActive && activeTimer && !gameOver) {
      interval = setInterval(() => {
        if (activeTimer === 'w') {
          setRedTime(prev => prev + 1);
        } else {
          setBlackTime(prev => prev + 1);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerActive, activeTimer, gameOver]);

  // Sync Timer with Turn
  useEffect(() => {
    if (isTimerActive) {
      setActiveTimer(boardState.turn);
    }
  }, [boardState.turn, isTimerActive]);

  const handleTimerClick = (color: 'w' | 'b') => {
    // If game is over, do nothing
    if (gameOver) return;

    // Start timer if not active
    if (!isTimerActive) {
        setIsTimerActive(true);
    }

    // If the clicked timer does not match current turn in FEN, switch the turn
    if (boardState.turn !== color) {
        // Generate new FEN with switched turn
        // Note: generateFen requires the board array and the *next* turn.
        // But here we want to set the *current* state's turn.
        // generateFen(board, color) produces a FEN where it is `color`'s turn.
        const newFen = generateFen(boardState.board, color);
        setFen(newFen);
        // Also clear any move history/selection as the game state is being manually adjusted?
        // Maybe not necessary, but safe to clear selection.
        setSelectedSquare(null);
    }
    
    setActiveTimer(color);
  };

  // Initialize Engine
  useEffect(() => {
    const cleanupStatus = window.api.onEngineStatus((status: SetStateAction<string>) => setEngineStatus(status));
    const cleanupInfo = window.api.onEngineInfo((info: any) => {
        setEngineInfo((prev: any) => {
            const newInfo = prev ? {...prev} : {};
            
            if (info.multipv) {
                newInfo[info.multipv] = { ...(newInfo[info.multipv] || {}), ...info };
            } else {
                // Fallback for engines not sending multipv or single pv mode
                // Only update if we have meaningful info (like pv or score) or if it's the only info we have
                // If it's a global update (e.g. depth only), we might want to skip or apply to primary
                // But to be safe, let's merge into slot 1.
                newInfo[1] = { ...(newInfo[1] || {}), ...info };
            }
            return newInfo;
        });
    });
    
    window.api.startEngine().then((success: any) => {
      if (success) {
        setEngineStatus('Ready');
        window.api.sendToEngine('uci');
        setTimeout(() => window.api.sendToEngine('setoption name MultiPV value 3'), 500);
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
    const isCurrentTurnAi = (boardState.turn === 'w' && isRedAi) || (boardState.turn === 'b' && isBlackAi);

    // If it's AI's turn
    if (isCurrentTurnAi && engineStatus.toLowerCase() === 'ready' && !isAiThinking && !gameOver) {
      setEngineInfo({}); // Clear previous info
      setIsCheckingRule(false); // Reset checking rule flag
      setIsAiThinking(true);
      window.api.sendToEngine(`position fen ${fen}`);
      
      const cmd = aiLimit.type === 'time' 
          ? `go movetime ${aiLimit.value}` 
          : `go depth ${aiLimit.value}`;
      window.api.sendToEngine(cmd);
    } else if (!isCurrentTurnAi && engineStatus.toLowerCase() === 'ready' && !gameOver) {
      // Check if Human is checkmated or stalemated, and provide analysis
      setEngineInfo({}); // Clear previous info
      setIsCheckingRule(true);
      window.api.sendToEngine(`position fen ${fen}`);
      
      // Use configured limit for analysis/checking
      const cmd = aiLimit.type === 'time' 
          ? `go movetime ${aiLimit.value}` 
          : `go depth ${aiLimit.value}`;
      window.api.sendToEngine(cmd);
    }
  }, [fen, boardState, engineStatus, isAiThinking, gameOver, isRedAi, isBlackAi, aiLimit]);

  const applyMove = useCallback((from: { row: number, col: number }, to: { row: number, col: number }) => {
    // Safety check: ensure source has a piece
    const piece = boardState.board[from.row][from.col];
    if (!piece) {
        console.error("Attempted to move from empty square", from);
        return;
    }

    // Safety check: ensure we are moving the correct color
    if (piece.color !== boardState.turn) {
        console.error(`Attempted to move wrong color piece. Turn: ${boardState.turn}, Piece: ${piece.color}`);
        return;
    }

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
    
    // Ensure timer starts on any move
    if (!isTimerActive) setIsTimerActive(true);
  }, [boardState, fen, lastMove, isTimerActive]);

  const handleUndo = () => {
    if (history.length === 0) return;

    // If AI is thinking, interrupt it
    if (isAiThinking) {
        setIsAiThinking(false);
        isAiThinkingRef.current = false; // Prevent race condition
        window.api.sendToEngine('stop');
        
        // Undo 1 step
        const prevState = history[history.length - 1];
        setFen(prevState.fen);
        setLastMove(prevState.lastMove);
        setHistory(prev => prev.slice(0, -1));
        setMoveHistory(prev => prev.slice(0, -1));
        return;
    }

    // Determine undo steps based on configuration
    // If playing Human vs AI (one AI, one Human), we usually want to undo 2 steps (AI move + User move)
    // If Human vs Human, undo 1 step
    // If AI vs AI, undo 1 step (and pause?)
    
    const isHumanVsAi = (isRedAi && !isBlackAi) || (!isRedAi && isBlackAi);
    const isHumanVsHuman = !isRedAi && !isBlackAi;
    // const isAiVsAi = isRedAi && isBlackAi;

    let stepsToUndo = 1;

    // If it's Human vs AI, and it is currently Human's turn, it means the last move was made by AI.
    // Usually user wants to undo THEIR move, so they want to go back 2 steps (AI move + User move).
    // But if it is AI's turn (AI hasn't started thinking yet?), we might just undo 1.
    // The `isAiThinking` check above handles the case where AI is currently processing.
    // So if we are here, AI is NOT thinking.
    // If it is Human's turn, last move was AI. Step before was Human. So undo 2.
    const isCurrentTurnHuman = (boardState.turn === 'w' && !isRedAi) || (boardState.turn === 'b' && !isBlackAi);

    if (isHumanVsAi && isCurrentTurnHuman) {
        stepsToUndo = 2;
    }

    if (history.length >= stepsToUndo) {
        const prevState = history[history.length - stepsToUndo];
        setFen(prevState.fen);
        setLastMove(prevState.lastMove);
        setHistory(prev => prev.slice(0, -stepsToUndo));
        setMoveHistory(prev => prev.slice(0, -stepsToUndo));
        setGameOver(null);
    } else if (history.length > 0) {
        // Fallback if not enough history
        const prevState = history[0];
        setFen(prevState.fen);
        setLastMove(prevState.lastMove);
        setHistory([]);
        setMoveHistory([]);
        setGameOver(null);
    }
  };

  // Handle AI Best Move
  useEffect(() => {
    const cleanup = window.api.onBestMove((moveStr: string) => {
      console.log('Best move received:', moveStr, 'isCheckingRule:', isCheckingRuleRef.current);
      
      if (isCheckingRuleRef.current) {
        setIsCheckingRule(false);
        // If we are just checking rules (Human turn)
        if (!moveStr || moveStr === '(none)') {
          const loser = boardState.turn === 'w' ? 'Red' : 'Black';
          setGameOver(`${loser} Lost! (No legal moves)`);
        }
        return;
      }

      // If we are not expecting AI to move (e.g. cancelled by Undo), ignore
      if (!isAiThinkingRef.current) return;

      if (!moveStr || moveStr === '(none)') {
          isAiThinkingRef.current = false;
          setIsAiThinking(false);
          const loser = boardState.turn === 'w' ? 'Red (AI)' : 'Black (AI)';
          setGameOver(`${loser} Lost! (No legal moves)`);
          return;
      }

      const move = fromUciMove(moveStr);
      const piece = boardState.board[move.from.row][move.from.col];
      
      // Check for Ghost Move (Analysis result arriving during AI turn)
      // If the move corresponds to a piece of the wrong color, it's likely from the previous turn's analysis
      if (piece && piece.color !== boardState.turn) {
          console.warn("Ignored ghost move (wrong turn color):", moveStr);
          return; // Keep isAiThinking=true, wait for real move
      }

      // Prevent race conditions: immediately mark as not thinking
      isAiThinkingRef.current = false;
      setIsAiThinking(false);
      
      // Apply AI move
      applyMove(move.from, move.to);
    });
    return cleanup;
  }, [applyMove]);

  // AI Watchdog to prevent stuck state
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isAiThinking) {
        // Calculate timeout based on AI limit
        // For 'time' mode: give it a buffer (e.g., 2 seconds) beyond the limit
        // For 'depth' mode: use a longer safety timeout (e.g., 60 seconds) as depth time is variable
        const timeoutMs = aiLimit.type === 'time' ? aiLimit.value + 2000 : 60000;

        timer = setTimeout(() => {
            if (isAiThinkingRef.current) {
                console.warn(`AI thinking timeout (${timeoutMs}ms), forcing reset`);
                setIsAiThinking(false);
                window.api.sendToEngine('stop');
                setEngineStatus('Ready (Reset after timeout)');
            }
        }, timeoutMs);
    }
    return () => clearTimeout(timer);
  }, [isAiThinking, aiLimit]);

  const handleReRecognize = async () => {
    if (!lastRecognizedImage && !lastSourceId) return;
    
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

        console.log("Attempting recognition via API...");
        const result = await recognizeBoardViaApi(imageToProcess);
        console.log("API Result:", result);
        
        // The API returns the FEN directly
        setFen(result.fen);
        
        const validation = validateFen(result.fen);
        if (!validation.valid) {
             alert(`识别结果可能不完整: ${validation.error}\nRecognition might be incomplete.`);
        }

        setMoveHistory([]);
        setHistory([]);
        setLastMove(null);
        setGameOver(null);
        setEngineInfo({}); // Clear stale analysis

        // Reset Timers
        setRedTime(0);
        setBlackTime(0);
        setIsTimerActive(false);
        setActiveTimer(null);
    } catch(e) {
        console.error(e);
        alert('Re-recognition failed: ' + e);
    } finally {
        setIsRecognizing(false);
    }
  };



  const handleSquareClick = async (row: number, col: number) => {
    if (gameOver) return;

    const piece = boardState.board[row][col];
    // Check if it is currently Human's turn
    const isRedTurn = boardState.turn === 'w';
    const isHumanTurn = (isRedTurn && !isRedAi) || (!isRedTurn && !isBlackAi);

    if (!isHumanTurn) return; // Wait for AI

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

      // Validate move rules
      const validation = validateMove(boardState.board, { from: selectedSquare, to: { row, col } });
      if (!validation.valid) {
          // Optional: Show error to user (toast or alert)
          console.warn('Invalid move:', validation.error);
          // For now, maybe just blink or do nothing? Or alert?
          // Let's use a simple alert for feedback as requested "check if legal" implies feedback.
          // But maybe user just wants to prevent illegal moves.
          // Let's use console warn + maybe a small UI indication if possible, but alert is safest for now.
          // Actually, let's just prevent it. If user wants feedback, they can check console. 
          // Re-reading user request: "Check if legal before move". 
          // Usually UI should prevent illegal moves silently or with a shake.
          // Given the codebase uses alerts for errors, I'll add a comment or small alert?
          // I'll stick to preventing the move. The user can click again if they want to re-select.
          // To be helpful, I will show an alert so they know WHY it failed (e.g. "King facing King").
          alert(validation.error); 
          return;
      }

      // Apply move locally
      applyMove(selectedSquare, { row, col });
      setSelectedSquare(null);
    } else {
      // Select
      const isRedPiece = piece && piece.color === 'w';
      const isBlackPiece = piece && piece.color === 'b';
      
      // Allow selection if it's the piece's turn and that turn is controlled by Human
      // We already checked `isHumanTurn` above.
      // So we just need to make sure we select the piece corresponding to the current turn.
      if (piece && piece.color === boardState.turn) {
        setSelectedSquare({ row, col });
      }
    }
  };

  const getBestMovesForBoard = () => {
      if (!engineInfo) return [];
      
      const moves: any[] = [];
      Object.entries(engineInfo).forEach(([k, info]: [string, any]) => {
          if (info.pv) {
              const moveStr = info.pv.split(' ')[0]; // Get the first move of the PV
              if (moveStr) {
                  const move = fromUciMove(moveStr);
                  let score = '';
                  if (info.scoreType === 'mate') {
                      score = `M${info.scoreValue}`;
                  } else {
                      // CP score is usually from white's perspective in UCI
                      // But engines might normalize it.
                      // Pikafish/Stockfish CP is centipawns.
                      // Positive is good for side to move? Or always white?
                      // UCI standard says: "score from the engine's point of view" usually.
                      // Wait, stockfish is "score cp x" where x is centipawns. 
                      // Positive x means white advantage, negative x means black advantage?
                      // Actually UCI standard says: "the score is from the engine's point of view" (side to move).
                      // Let's assume side to move for now.
                      score = (info.scoreValue / 100).toFixed(2);
                      if (info.scoreValue > 0) score = '+' + score;
                  }
                  
                  // Get Chinese Notation
                  const chineseNotation = getChineseMoveNotation(boardState.board, move);

                  moves.push({
                      from: move.from,
                      to: move.to,
                      score: score,
                      rank: parseInt(k),
                      chineseNotation: chineseNotation // Add Chinese notation to move data
                  });
              }
          }
      });
      return moves;
  };

  const handleStartSimulation = () => {
      // Save current state
      setSimulationSnapshot({
          fen,
          moveHistory: [...moveHistory],
          history: [...history],
          lastMove,
          gameOver,
          isRedAi,
          isBlackAi
      });
      setIsSimulationMode(true);
      // Optional: Auto-switch to human vs human for easier simulation?
      // setIsRedAi(false);
      // setIsBlackAi(false);
  };

  const handleStopSimulation = () => {
      if (!simulationSnapshot) return;
      
      // Restore state
      setFen(simulationSnapshot.fen);
      setMoveHistory(simulationSnapshot.moveHistory);
      setHistory(simulationSnapshot.history);
      setLastMove(simulationSnapshot.lastMove);
      setGameOver(simulationSnapshot.gameOver);
      setIsRedAi(simulationSnapshot.isRedAi);
      setIsBlackAi(simulationSnapshot.isBlackAi);
      
      setIsSimulationMode(false);
      setSimulationSnapshot(null);
      
      // Stop engine if it was thinking
      if (isAiThinking) {
           setIsAiThinking(false);
           window.api.sendToEngine('stop');
      }
      // Clear info to force refresh
      setEngineInfo({});
  };

  return (
    <div className="flex h-screen bg-stone-200 p-8 gap-8 relative overflow-hidden">
      <div className="flex-1 flex justify-center items-center relative w-full">
        {/* Timers - Centered on Left */}
        <div className="absolute left-8 top-1/2 transform -translate-y-1/2 flex flex-col gap-32 z-20">
            {/* Top Timer */}
            {isFlipped ? (
                /* Red Timer when Flipped (Top) */
                <ChessTimer 
                    time={redTime}
                    isRunning={isTimerActive && activeTimer === 'w'}
                    label="红方 (Red)"
                    color="red"
                    isActive={activeTimer === 'w'}
                    onClick={() => handleTimerClick('w')}
                />
            ) : (
                /* Black Timer when Normal (Top) */
                <ChessTimer 
                    time={blackTime}
                    isRunning={isTimerActive && activeTimer === 'b'}
                    label="黑方 (Black)"
                    color="black"
                    isActive={activeTimer === 'b'}
                    onClick={() => handleTimerClick('b')}
                />
            )}

            {/* Bottom Timer */}
            {isFlipped ? (
                /* Black Timer when Flipped (Bottom) */
                <ChessTimer 
                    time={blackTime}
                    isRunning={isTimerActive && activeTimer === 'b'}
                    label="黑方 (Black)"
                    color="black"
                    isActive={activeTimer === 'b'}
                    onClick={() => handleTimerClick('b')}
                />
            ) : (
                /* Red Timer when Normal (Bottom) */
                <ChessTimer 
                    time={redTime}
                    isRunning={isTimerActive && activeTimer === 'w'}
                    label="红方 (Red)"
                    color="red"
                    isActive={activeTimer === 'w'}
                    onClick={() => handleTimerClick('w')}
                />
            )}
        </div>

        {/* Floating Undo Button - Top Left */}
        <button
            onClick={handleUndo}
            disabled={history.length === 0}
            className={`absolute top-0 left-0 z-30 px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 transition-all ${
                history.length === 0 
                ? 'bg-stone-300 text-stone-500 cursor-not-allowed opacity-50' 
                : 'bg-white text-stone-700 hover:bg-amber-50 hover:text-amber-600 border border-stone-200'
            }`}
            title="悔棋 (Undo)"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            <span>悔棋</span>
        </button>

        {/* Top Right Buttons Group */}
        <div className="absolute top-0 right-0 z-30 flex gap-2">
            {/* Simulation Button */}
            <button
                onClick={isSimulationMode ? handleStopSimulation : handleStartSimulation}
                className={`px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 transition-all ${
                    isSimulationMode 
                    ? 'bg-amber-600 text-white hover:bg-amber-700 border border-amber-700 animate-pulse' 
                    : 'bg-purple-600 text-white hover:bg-purple-700 border border-purple-700'
                }`}
                title={isSimulationMode ? "结束推演" : "开始推演"}
            >
                <span>{isSimulationMode ? '⏹️' : '🎮'}</span> 
                <span>{isSimulationMode ? '结束推演' : '推演'}</span>
            </button>

            {/* Recognize Button */}
            <button
                onClick={() => setShowCapture(true)}
                className="px-4 py-2 rounded-full font-bold shadow-lg bg-blue-600 text-white hover:bg-blue-700 border border-blue-700 flex items-center gap-2 transition-all"
                title="识别棋盘"
            >
                <span>📷</span>
                <span>识别</span>
            </button>

            {/* Re-Recognize Button */}
            {lastRecognizedImage && (
                <button
                    onClick={handleReRecognize}
                    disabled={isRecognizing}
                    className="px-4 py-2 rounded-full font-bold shadow-lg bg-green-600 text-white hover:bg-green-700 border border-green-700 flex items-center gap-2 transition-all"
                    title="重新识别"
                >
                    <span>🔄</span>
                    <span>重识</span>
                </button>
            )}

            {/* Restart Button */}
            <button
                onClick={() => {
                if (window.confirm('确定要重新开始对局吗？')) {
                    // Stop Engine first
                    window.api.sendToEngine('stop');
                    
                    setFen(START_FEN);
                    setGameOver(null);
                    setIsCheckingRule(false);
                    setIsAiThinking(false);
                    setEngineInfo({}); // Reset Engine Info to empty object instead of null to prevent errors
                    setMoveHistory([]);
                    setHistory([]);
                    setLastMove(null);
                    
                    // Reset Timers
                    setRedTime(0);
                    setBlackTime(0);
                    setIsTimerActive(false);
                    setActiveTimer(null);
                }
                }}
                className="px-4 py-2 rounded-full font-bold shadow-lg bg-stone-600 text-white hover:bg-stone-700 border border-stone-700 flex items-center gap-2 transition-all"
                title="重新开始 (Restart)"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>重开</span>
            </button>

            {/* Flip Button */}
            <button
                onClick={() => setIsFlipped(!isFlipped)}
                className="px-4 py-2 rounded-full font-bold shadow-lg bg-white text-stone-700 hover:bg-stone-50 hover:text-stone-900 border border-stone-200 flex items-center gap-2 transition-all"
                title="翻转棋盘 (Flip Board)"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                <span>翻转</span>
            </button>
        </div>

        <Board 
          board={boardState.board} 
          onSquareClick={handleSquareClick} 
          selectedSquare={selectedSquare}
          lastMove={lastMove}
          isFlipped={isFlipped}
          bestMoves={showAiHints ? getBestMovesForBoard() : []}
        />
        
        {/* Toggle Panel Button (Floating when panel hidden) */}
        {!isPanelVisible && (
            <button
                onClick={() => setIsPanelVisible(true)}
                className="absolute right-0 top-1/2 -translate-y-1/2 bg-white p-2 rounded-l-lg shadow-lg hover:bg-gray-50 z-30 border border-r-0 border-gray-200"
                title="显示控制面板"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
            </button>
        )}
      </div>

      <div className={`
          absolute top-4 right-4 bottom-4 z-40
          bg-white rounded-lg shadow-2xl flex flex-col gap-4 transition-all duration-300 ease-in-out border border-gray-200
          ${isPanelVisible ? 'w-80 p-4 translate-x-0 opacity-100' : 'w-0 p-0 translate-x-full opacity-0 overflow-hidden pointer-events-none'}
      `}>
        <div className="flex justify-between items-center min-w-[280px]">
            <h1 className="text-2xl font-bold text-stone-800">Xiangqi Assistant</h1>
            <div className="flex gap-2">
                      <button 
                          onClick={() => setIsPanelVisible(false)}
                    className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-stone-600 transition-colors"
                    title="隐藏面板"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>
        </div>
        
        <div className="min-w-[280px] flex flex-col gap-4 flex-1 overflow-hidden">
        {/* AI Control Selection */}
        <div className="flex flex-col gap-2 bg-gray-100 p-3 rounded-lg text-sm">
           <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                    type="checkbox" 
                    checked={isRedAi}
                    onChange={(e) => setIsRedAi(e.target.checked)}
                    className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                />
                <span className={isRedAi ? "font-bold text-red-700" : "text-gray-700"}>红方由电脑控制 (Red AI)</span>
           </label>
           <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                    type="checkbox" 
                    checked={isBlackAi}
                    onChange={(e) => setIsBlackAi(e.target.checked)}
                    className="w-4 h-4 text-stone-800 rounded focus:ring-stone-700"
                />
                <span className={isBlackAi ? "font-bold text-stone-900" : "text-gray-700"}>黑方由电脑控制 (Black AI)</span>
           </label>
           
           <div className="mt-2 pt-2 border-t border-gray-200">
             <label className="flex items-center gap-2 mb-2">
                <input 
                    type="checkbox" 
                    checked={showAiHints}
                    onChange={(e) => setShowAiHints(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                />
                <span className="text-gray-700 font-medium">显示AI提示 (Show Hints)</span>
             </label>

             <label className="flex items-center gap-2">
               <span className="text-gray-600 font-medium">思考深度/时间:</span>
               <select 
                 className="flex-1 text-xs border border-gray-300 rounded p-1"
                 value={`${aiLimit.type}_${aiLimit.value}`}
                 onChange={(e) => {
                   const [type, valStr] = e.target.value.split('_');
                   setAiLimit({ type: type as 'time' | 'depth', value: parseInt(valStr) });
                 }}
               >
                 <option value="time_1000">快速 (1秒)</option>
                 <option value="time_3000">标准 (3秒)</option>
                 <option value="time_5000">强力 (5秒)</option>
                 <option value="time_10000">大师 (10秒)</option>
                 <option disabled>──────────</option>
                 <option value="depth_15">深度 15层</option>
                 <option value="depth_20">深度 20层</option>
                 <option value="depth_25">深度 25层</option>
               </select>
             </label>
           </div>
        </div>



        <div className={`p-4 rounded ${engineStatus.includes('Failed') ? 'bg-red-100 text-red-800' : 'bg-gray-100'}`}>
          <h2 className="font-bold mb-2">Engine</h2>
          <p className="text-sm">{engineStatus}</p>
          {isAiThinking && <p className="text-blue-600 font-bold animate-pulse">AI is thinking...</p>}
          {isRecognizing && <p className="text-purple-600 font-bold animate-pulse">Recognizing Board...</p>}
          {gameOver && <p className="text-red-600 font-bold text-lg mt-2">{gameOver}</p>}
        </div>

        {/* Engine Info Removed */}


        
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
      </div>
      
      {showCapture && (
        <ScreenCapture 
          onCancel={() => setShowCapture(false)}
          onCapture={async (imageData, sourceId) => {
            setShowCapture(false);
            setLastRecognizedImage(imageData);
            if (sourceId) setLastSourceId(sourceId);
            
            setIsRecognizing(true);
            try {
                console.log("Attempting recognition via API...");
                const result = await recognizeBoardViaApi(imageData);
                console.log("API Result:", result);
                
                // Validate FEN
                const validation = validateFen(result.fen);
                if (!validation.valid) {
                     alert(`识别结果可能不完整: ${validation.error}\nRecognition might be incomplete.`);
                }

                setFen(result.fen);
                setMoveHistory([]);
                setHistory([]);
                setLastMove(null);
                setGameOver(null);
                setEngineInfo({});
                // Reset Timers
                setRedTime(0);
                setBlackTime(0);
                setIsTimerActive(false);
                setActiveTimer(null);
            } catch(e) {
                console.error(e);
                alert('Recognition failed: ' + e);
            } finally {
                setIsRecognizing(false);
            }
          }}
        />
      )}
    </div>
  )
}

export default App
