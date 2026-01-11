import React from 'react';

interface ChessTimerProps {
  time: number; // in milliseconds
  isRunning: boolean;
  label: string;
  color: 'red' | 'black';
  onClick?: () => void;
  isActive?: boolean;
}

export const ChessTimer: React.FC<ChessTimerProps> = ({ time, isRunning, label, color, onClick, isActive }) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isRed = color === 'red';
  
  // Base styles
  let bgClass = '';
  let textClass = '';
  let borderClass = '';
  
  if (isRed) {
      if (isActive) {
          bgClass = 'bg-red-700';
          textClass = 'text-white';
          borderClass = 'border-amber-500';
      } else {
          bgClass = 'bg-red-900';
          textClass = 'text-red-300';
          borderClass = 'border-transparent hover:border-red-500';
      }
  } else {
      // Black
      if (isActive) {
          bgClass = 'bg-stone-800';
          textClass = 'text-white';
          borderClass = 'border-amber-500';
      } else {
          bgClass = 'bg-stone-700';
          textClass = 'text-stone-400';
          borderClass = 'border-transparent hover:border-stone-500';
      }
  }

  const activeScale = isActive ? 'scale-110 shadow-xl' : 'scale-100 shadow-lg';
  const pulseClass = !isRunning && isActive ? 'animate-pulse ring-4 ring-amber-400/50' : '';

  return (
    <div 
        onClick={onClick}
        className={`
            flex flex-col items-center justify-center p-4 border-2 rounded-lg 
            transition-all duration-300 cursor-pointer w-32 select-none
            ${bgClass} ${borderClass} ${textClass} ${activeScale} ${pulseClass}
        `}
    >
      <div className="text-sm font-bold mb-1">{label}</div>
      <div className="text-2xl font-mono font-bold">
        {formatTime(time)}
      </div>
    </div>
  );
};
