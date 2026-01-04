import React, { useState, useRef, useEffect } from 'react';

interface Point {
  x: number;
  y: number;
}

interface BoardCalibrationProps {
  imageData: string;
  initialCorners?: { tl: Point; tr: Point; bl: Point; br: Point } | null;
  onConfirm: (corners: { tl: Point; tr: Point; bl: Point; br: Point }) => void;
  onCancel: () => void;
}

export const BoardCalibration: React.FC<BoardCalibrationProps> = ({ imageData, initialCorners, onConfirm, onCancel }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
  
  // Default corners (inset by 10% to be visible)
  const [corners, setCorners] = useState<{ tl: Point; tr: Point; bl: Point; br: Point }>(initialCorners || {
    tl: { x: 0.1, y: 0.1 },
    tr: { x: 0.9, y: 0.1 },
    bl: { x: 0.1, y: 0.9 },
    br: { x: 0.9, y: 0.9 },
  });
  
  const [dragging, setDragging] = useState<keyof typeof corners | null>(null);
  const [isRectangular, setIsRectangular] = useState(true);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setImgSize({ width: e.currentTarget.width, height: e.currentTarget.height });
  };

  const handleMouseDown = (corner: keyof typeof corners) => {
    setDragging(corner);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    
    if (isRectangular) {
        setCorners(prev => {
            const newCorners = { ...prev };
            // Update the dragged corner
            newCorners[dragging] = { x, y };
            
            // Update neighbors to maintain rectangle
            // tl: top-left, tr: top-right, bl: bottom-left, br: bottom-right
            if (dragging === 'tl') {
                newCorners.bl.x = x; // Align left
                newCorners.tr.y = y; // Align top
            } else if (dragging === 'tr') {
                newCorners.br.x = x; // Align right
                newCorners.tl.y = y; // Align top
            } else if (dragging === 'bl') {
                newCorners.tl.x = x; // Align left
                newCorners.br.y = y; // Align bottom
            } else if (dragging === 'br') {
                newCorners.tr.x = x; // Align right
                newCorners.bl.y = y; // Align bottom
            }
            return newCorners;
        });
    } else {
        setCorners(prev => ({ ...prev, [dragging]: { x, y } }));
    }
  };

  const handleMouseUp = () => {
    setDragging(null);
  };

  // Grid lines for visualization
  const renderGrid = () => {
    // 9 cols (8 gaps), 10 rows (9 gaps)
    const lines = [];
    
    // Interpolate points
    const getPoint = (row: number, col: number) => {
      // Bilinear interpolation
      // u = col / 8, v = row / 9
      const u = col / 8;
      const v = row / 9;
      
      const topX = corners.tl.x + (corners.tr.x - corners.tl.x) * u;
      const topY = corners.tl.y + (corners.tr.y - corners.tl.y) * u;
      const botX = corners.bl.x + (corners.br.x - corners.bl.x) * u;
      const botY = corners.bl.y + (corners.br.y - corners.bl.y) * u;
      
      const x = topX + (botX - topX) * v;
      const y = topY + (botY - topY) * v;
      
      return { x: x * 100 + '%', y: y * 100 + '%' };
    };

    // Vertical lines
    for (let c = 0; c < 9; c++) {
      const start = getPoint(0, c);
      const end = getPoint(9, c);
      lines.push(
        <line 
          key={`v-${c}`} 
          x1={start.x} y1={start.y} 
          x2={end.x} y2={end.y} 
          stroke="red" strokeWidth="1" opacity="0.5" 
        />
      );
    }

    // Horizontal lines
    for (let r = 0; r < 10; r++) {
      const start = getPoint(r, 0);
      const end = getPoint(r, 8);
      lines.push(
        <line 
          key={`h-${r}`} 
          x1={start.x} y1={start.y} 
          x2={end.x} y2={end.y} 
          stroke="red" strokeWidth="1" opacity="0.5" 
        />
      );
    }
    
    return lines;
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col items-center justify-center p-4"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="bg-white p-4 rounded w-full max-w-4xl flex flex-col gap-4">
        <h2 className="text-xl font-bold">Align Board Grid</h2>
        <div className="flex justify-between items-center">
             <p className="text-sm text-gray-500">Drag the 4 red corners to match the outer corners of the Xiangqi board.</p>
             <label className="flex items-center gap-2 text-sm select-none cursor-pointer">
                <input 
                    type="checkbox" 
                    checked={isRectangular} 
                    onChange={e => {
                        setIsRectangular(e.target.checked);
                        // Optional: Force rectangle when enabling?
                        // For now, let user drag to fix.
                    }}
                    className="w-4 h-4"
                />
                <span className="font-bold text-stone-700">保持矩形 (Lock Rectangle)</span>
             </label>
        </div>
        
        <div 
          ref={containerRef}
          className="relative select-none self-center"
          style={{ maxHeight: '70vh' }}
        >
          <img 
            src={imageData} 
            onLoad={handleImageLoad}
            className="max-h-[70vh] pointer-events-none" 
            alt="Calibration"
          />
          
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {renderGrid()}
          </svg>

          {/* Handles */}
          {(Object.keys(corners) as Array<keyof typeof corners>).map(key => (
            <div
              key={key}
              className="absolute w-6 h-6 bg-red-500 rounded-full border-2 border-white cursor-move transform -translate-x-1/2 -translate-y-1/2 shadow-lg hover:scale-110 transition-transform"
              style={{ 
                left: `${corners[key].x * 100}%`, 
                top: `${corners[key].y * 100}%` 
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                handleMouseDown(key);
              }}
            />
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
          <button 
            onClick={() => onConfirm(corners)} 
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Start Recognition
          </button>
        </div>
      </div>
    </div>
  );
};
