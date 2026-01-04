import Tesseract from 'tesseract.js';
import { BoardState, PieceColor, PieceType } from './xiangqi';

export interface Point {
  x: number;
  y: number;
}

export interface BoardCorners {
  tl: Point;
  tr: Point;
  bl: Point;
  br: Point;
}

const CHAR_TO_PIECE: Record<string, { type: PieceType, color: PieceColor }> = {
  // Red (mapped to 'w' for FEN/Engine compatibility)
  '車': { type: 'r', color: 'w' }, '俥': { type: 'r', color: 'w' }, '车': { type: 'r', color: 'w' },
  '馬': { type: 'n', color: 'w' }, '傌': { type: 'n', color: 'w' }, '马': { type: 'n', color: 'w' },
  '相': { type: 'b', color: 'w' },
  '仕': { type: 'a', color: 'w' },
  '帥': { type: 'k', color: 'w' }, '帅': { type: 'k', color: 'w' },
  '炮': { type: 'c', color: 'w' }, '砲': { type: 'c', color: 'w' },
  '兵': { type: 'p', color: 'w' },

  // Black
  '象': { type: 'b', color: 'b' },
  '士': { type: 'a', color: 'b' },
  '將': { type: 'k', color: 'b' }, '将': { type: 'k', color: 'b' },
  '卒': { type: 'p', color: 'b' },
};

// Common OCR misinterpretations
const OCR_FIXES: Record<string, string> = {
  'Rn': '車', // Example if it reads nonsense
  'If': '仕',
  'It': '仕',
  '1+': '仕',
  // Add more as we test
};

// Template Storage
const TEMPLATE_KEY = 'xiangqi_piece_templates_v2';
let templates: Record<string, { type: PieceType, color: PieceColor } | null> = {};

// Tesseract Worker Singleton
let tesseractWorker: Tesseract.Worker | null = null;
let workerInitializing: Promise<Tesseract.Worker> | null = null;

async function getTesseractWorker(): Promise<Tesseract.Worker> {
  if (tesseractWorker) return tesseractWorker;
  
  if (workerInitializing) return workerInitializing;

  workerInitializing = (async () => {
    const worker = await Tesseract.createWorker('chi_sim');
    await worker.setParameters({
      tessedit_char_whitelist: '車俥车馬傌马相象仕士帥帅將将炮砲兵卒',
      tessedit_pageseg_mode: '7' as any, // PSM.SINGLE_LINE
    });
    tesseractWorker = worker;
    return worker;
  })();

  return workerInitializing;
}

try {
  const saved = localStorage.getItem(TEMPLATE_KEY);
  if (saved) templates = JSON.parse(saved);
} catch (e) {
  console.error('Failed to load templates', e);
}

export function saveTemplate(hash: string, piece: { type: PieceType, color: PieceColor } | null) {
  templates[hash] = piece;
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
}

function hammingDistance(h1: string, h2: string): number {
    let dist = 0;
    for(let i=0; i<h1.length; i++) {
        if(h1[i] !== h2[i]) dist++;
    }
    return dist;
}

function findClosestTemplate(hash: string): { piece: { type: PieceType, color: PieceColor } | null, distance: number } | null {
    if (Object.keys(templates).length === 0) return null;

    if (hash in templates) {
        return { piece: templates[hash], distance: 0 };
    }
    
    let bestPiece: { type: PieceType, color: PieceColor } | null = null;
    let minDistance = Infinity;
    
    for (const [tplHash, tplPiece] of Object.entries(templates)) {
        const dist = hammingDistance(hash, tplHash);
        if (dist < minDistance) {
            minDistance = dist;
            bestPiece = tplPiece;
        }
    }
    
    return { piece: bestPiece, distance: minDistance };
}

function calculateHash(ctx: CanvasRenderingContext2D, width: number, height: number): string {
  // 1. Resize to 16x16 for hashing
  const hashCanvas = document.createElement('canvas');
  hashCanvas.width = 16;
  hashCanvas.height = 16;
  const hCtx = hashCanvas.getContext('2d');
  if (!hCtx) return '';
  
  hCtx.drawImage(ctx.canvas, 0, 0, width, height, 0, 0, 16, 16);
  const data = hCtx.getImageData(0, 0, 16, 16).data;
  
  // 2. Binarize and build string
  let hash = '';
  // Calculate avg brightness
  let total = 0;
  for(let i=0; i<data.length; i+=4) {
      total += (data[i] + data[i+1] + data[i+2]) / 3;
  }
  const avg = total / (16*16);
  
  for(let i=0; i<data.length; i+=4) {
      const val = (data[i] + data[i+1] + data[i+2]) / 3;
      hash += val > avg ? '1' : '0';
  }
  return hash;
}

function processSquare(sourceCanvas: HTMLCanvasElement, x: number, y: number, size: number): { processedCanvas: HTMLCanvasElement, hash: string } | null {
  // 1. Skip Refine Center (Auto-Correction) - Trust the user/grid
  // The previous logic attempted to center the character based on centroid of black pixels.
  // However, this caused issues when the user manually corrected the grid (it would "correct" it back to the wrong place).
  // It also was sensitive to grid lines and noise.
  
  const finalX = x;
  const finalY = y;

  // 2. Final Crop & Process
  // Prepare for OCR (Upscale + Binarize + Padding)
  const pCanvas = document.createElement('canvas');
  const scale = 3.0; // Increase scale
  const padding = 20; // Add padding
  const scaledSize = size * scale;
  pCanvas.width = scaledSize + padding * 2;
  pCanvas.height = scaledSize + padding * 2;
  const pCtx = pCanvas.getContext('2d');
  if (!pCtx) return null;
  
  // Fill white background
  pCtx.fillStyle = '#FFFFFF';
  pCtx.fillRect(0, 0, pCanvas.width, pCanvas.height);
  
  // Draw original scaled up from the REFINED center
  pCtx.drawImage(sourceCanvas, finalX - size/2, finalY - size/2, size, size, padding, padding, scaledSize, scaledSize);
  
  // Binarize using Adaptive Thresholding
  adaptiveThreshold(pCtx, pCanvas.width, pCanvas.height);
  
  // Apply Circular Mask to remove corner noise (grid lines)
  // This is crucial because grid lines move relative to the piece when the piece moves.
  // By masking the corners to White (background), we make the hash robust to position changes.
  pCtx.fillStyle = '#FFFFFF';
  pCtx.beginPath();
  pCtx.rect(0, 0, pCanvas.width, pCanvas.height);
  // Cut out the center circle (counter-clockwise) to create a hole
  // Radius: slightly smaller than half width to cut off corners
  const radius = (scaledSize / 2) * 0.95; 
  pCtx.arc(pCanvas.width / 2, pCanvas.height / 2, radius, 0, Math.PI * 2, true);
  pCtx.fill();

  // Morphological Operation: Erode
  erode(pCtx, pCanvas.width, pCanvas.height);

  const hash = calculateHash(pCtx, pCanvas.width, pCanvas.height);
  
  return { processedCanvas: pCanvas, hash };
}

export async function learnPiece(imageDataUrl: string, corners: BoardCorners, row: number, col: number, piece: { type: PieceType, color: PieceColor } | null) {
  const img = await loadImage(imageDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(img, 0, 0);
  
  // Calculate geometry (same as recognizeBoard)
  // ... (We need to duplicate geometry logic or extract it)
  // Let's extract geometry logic to a helper
  const { x, y, cropSize } = getBoardGeometry(img.width, img.height, corners, row, col);
  
  const result = processSquare(canvas, x, y, cropSize);
  if (result) {
    saveTemplate(result.hash, piece);
    const pieceName = piece ? `${piece.color}${piece.type}` : 'Empty';
    console.log(`Learned template for ${pieceName} at [${row},${col}] with hash ${result.hash.substring(0,10)}...`);
  }
}

function getBoardGeometry(imgWidth: number, imgHeight: number, corners: BoardCorners, row: number, col: number) {
    const getPoint = (r: number, c: number) => {
      const u = c / 8;
      const v = r / 9;
      const tx = corners.tl.x + (corners.tr.x - corners.tl.x) * u;
      const ty = corners.tl.y + (corners.tr.y - corners.tl.y) * u;
      const bx = corners.bl.x + (corners.br.x - corners.bl.x) * u;
      const by = corners.bl.y + (corners.br.y - corners.bl.y) * u;
      const x = tx + (bx - tx) * v;
      const y = ty + (by - ty) * v;
      return { x: x * imgWidth, y: y * imgHeight };
    };
    
    const p00 = getPoint(0,0);
    const p01 = getPoint(0,1);
    const avgCellWidth = Math.sqrt((p01.x - p00.x)**2 + (p01.y - p00.y)**2);
    const cropSize = avgCellWidth * 0.9;
    
    const { x, y } = getPoint(row, col);
    return { x, y, cropSize };
}

export async function getSquareImage(imageDataUrl: string, corners: BoardCorners, row: number, col: number): Promise<string> {
  const img = await loadImage(imageDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get context');
  ctx.drawImage(img, 0, 0);
  
  const { x, y, cropSize } = getBoardGeometry(img.width, img.height, corners, row, col);
  
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropSize;
  cropCanvas.height = cropSize;
  const cCtx = cropCanvas.getContext('2d');
  if (!cCtx) throw new Error('Could not get crop context');
  
  cCtx.drawImage(canvas, x - cropSize/2, y - cropSize/2, cropSize, cropSize, 0, 0, cropSize, cropSize);
  return cropCanvas.toDataURL();
}

export async function recognizeBoardWithCorners(imageDataUrl: string, corners: BoardCorners, onDebugImage?: (row: number, col: number, dataUrl: string) => void): Promise<BoardState> {
  const img = await loadImage(imageDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  
  ctx.drawImage(img, 0, 0);

  const board: BoardState = Array(10).fill(null).map(() => Array(9).fill(null));
  const piecePromises: Promise<void>[] = [];

  // Use Singleton Worker
  const worker = await getTesseractWorker();

  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      const { x, y, cropSize } = getBoardGeometry(img.width, img.height, corners, row, col);

      piecePromises.push((async () => {
        // 1. Detect Color
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = cropSize;
        colorCanvas.height = cropSize;
        const cCtx = colorCanvas.getContext('2d');
        if (!cCtx) return;
        cCtx.drawImage(canvas, x - cropSize/2, y - cropSize/2, cropSize, cropSize, 0, 0, cropSize, cropSize);
        const color = detectPieceColor(cCtx, cropSize, cropSize);

        // 2. Process Image (Upscale, Binarize, Hash)
        const processResult = processSquare(canvas, x, y, cropSize);
        if (!processResult) return;
        
        const { processedCanvas: pCanvas, hash } = processResult;

        if (onDebugImage) {
          onDebugImage(row, col, pCanvas.toDataURL());
        }

        // 3. Try Template Matching
        const match = findClosestTemplate(hash);
        // Allow up to 15 bits difference (approx 6% of pixels)
        if (match && match.distance <= 15) {
            const template = match.piece;
            if (template) {
                console.log(`[${row},${col}] Template Match (dist ${match.distance}): ${template.color}${template.type}`);
                board[row][col] = { ...template };
            } else {
                console.log(`[${row},${col}] Template Match (dist ${match.distance}): Empty`);
                board[row][col] = null;
            }
            return;
        }

        // 4. Check if Empty Square (Variance Check)
        // Use the color canvas (cropped original) for variance check
        // Center of colorCanvas is (cropSize/2, cropSize/2)
        if (isEmptySquare(cCtx, cropSize/2, cropSize/2, cropSize)) { 
             console.log(`[${row},${col}] Variance Check: Empty`);
             board[row][col] = null;
             return;
        }

        // 5. Fallback to OCR
        const { data: { text } } = await worker.recognize(pCanvas);
        let char = text.trim().replace(/\s/g, '');
        if (char.length > 0) char = char[0]; 
        
        console.log(`[${row},${col}] Color: ${color}, Text: ${text}, Char: ${char}, Hash: ${hash.substring(0,8)}`);

        let pieceInfo = CHAR_TO_PIECE[char];
        
        if (pieceInfo) {
           if (pieceInfo.color === color) {
             board[row][col] = { type: pieceInfo.type, color: pieceInfo.color };
           } else {
             const uniqueChars = ['帥', '帅', '將', '将', '相', '象', '仕', '士', '兵', '卒'];
             if (uniqueChars.includes(char)) {
                 board[row][col] = { type: pieceInfo.type, color: pieceInfo.color };
             } else {
                 board[row][col] = { type: pieceInfo.type, color: color };
             }
           }
        }
      })());
    }
  }

  await Promise.all(piecePromises);
  // Do not terminate the singleton worker
  // await worker.terminate();
  return board;
}


function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function isEmptySquare(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): boolean {
  // Sample a smaller center area to avoid grid lines
  const sampleSize = size * 0.5;
  const imgData = ctx.getImageData(x - sampleSize/2, y - sampleSize/2, sampleSize, sampleSize);
  const data = imgData.data;
  
  let totalVar = 0;
  let rSum=0, gSum=0, bSum=0;
  
  for(let i=0; i<data.length; i+=4) {
    rSum += data[i];
    gSum += data[i+1];
    bSum += data[i+2];
  }
  const count = data.length / 4;
  const avgR = rSum / count;
  const avgG = gSum / count;
  const avgB = bSum / count;
  
  for(let i=0; i<data.length; i+=4) {
    totalVar += Math.abs(data[i] - avgR) + Math.abs(data[i+1] - avgG) + Math.abs(data[i+2] - avgB);
  }
  
  const avgDiff = totalVar / count;
  
  // Empty squares (board texture) are relatively uniform compared to text
  // But wood texture might have grain.
  // Pieces have high contrast text.
  // Threshold: Needs tuning.
  // If avgDiff is low -> Empty.
  return avgDiff < 15; // Conservative threshold
}

function adaptiveThreshold(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const gray = new Uint8Array(width * height);
  
  // 1. Extract Green channel (best contrast for Red/Black on Wood)
  for (let i = 0; i < width * height; i++) {
    gray[i] = data[i * 4 + 1]; 
  }

  // 2. Integral Image for fast local mean
  const integral = new Int32Array(width * height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      sum += gray[y * width + x];
      if (y === 0) {
        integral[y * width + x] = sum;
      } else {
        integral[y * width + x] = sum + integral[(y - 1) * width + x];
      }
    }
  }

  // 3. Apply Adaptive Threshold
  const windowSize = Math.floor(width / 8); // Window size relative to piece size
  const s2 = Math.floor(windowSize / 2);
  const constant = 10; // Threshold offset (C)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(x - s2, 0);
      const x2 = Math.min(x + s2, width - 1);
      const y1 = Math.max(y - s2, 0);
      const y2 = Math.min(y + s2, height - 1);
      
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      
      // Calculate sum of the window using integral image
      // sum = I(D) - I(B) - I(C) + I(A)
      // A=(x1-1, y1-1), B=(x2, y1-1), C=(x1-1, y2), D=(x2, y2)
      
      let sum = integral[y2 * width + x2];
      if (y1 > 0) sum -= integral[(y1 - 1) * width + x2];
      if (x1 > 0) sum -= integral[y2 * width + (x1 - 1)];
      if (x1 > 0 && y1 > 0) sum += integral[(y1 - 1) * width + (x1 - 1)];
      
      const mean = sum / count;
      
      // If pixel is significantly darker than local mean -> Text
      // data is RGBA
      const val = gray[y * width + x] < (mean - constant) ? 0 : 255;
      
      const idx = (y * width + x) * 4;
      data[idx] = val;
      data[idx+1] = val;
      data[idx+2] = val;
      // Alpha remains 255
    }
  }
  
  ctx.putImageData(imgData, 0, 0);
}

function erode(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Simple Erode (Min filter) to thin out black features (or remove small black noise if background is white?)
  // Wait, Erode usually shrinks the foreground.
  // In our binary image: Text is Black (0), Background is White (255).
  // If we want to remove thin BLACK lines (grid), we need to shrink Black -> "Dilate" White?
  // Terminology depends on what is "foreground".
  // If 0 is foreground, "Erode" makes it smaller.
  // If 255 is foreground, "Erode" makes it smaller (expanding Black).
  
  // We want to REMOVE thin black lines. So we want to expand WHITE.
  // This is technically "Dilation" of the white background, or "Erosion" of the black text.
  // Let's call it "removeNoise" - verify if a black pixel is surrounded by white, make it white.
  
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data; // copy
  const output = new Uint8ClampedArray(data);
  
  // Iterate pixels (excluding border)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
       const idx = (y * width + x) * 4;
       
       // If pixel is Black (0)
       if (data[idx] === 0) {
          // Check neighbors. If any neighbor is White (255), we might be on edge.
          // If we want to remove thin lines (1px wide), checking neighbors helps.
          // If a pixel is 0, but it has > N white neighbors, maybe it's noise?
          
          // Let's implement a standard Max filter (which expands White, shrinks Black).
          // Max(3x3)
          let maxVal = 0;
          for(let dy=-1; dy<=1; dy++) {
             for(let dx=-1; dx<=1; dx++) {
                const nIdx = ((y+dy) * width + (x+dx)) * 4;
                if (data[nIdx] > maxVal) maxVal = data[nIdx];
             }
          }
          
          if (maxVal === 255) {
             // If any neighbor is white, become white? 
             // This will strip 1 layer of pixels from all black objects.
             // This might make characters too thin!
             // Only do this if the line is VERY thin.
             
             // Maybe Median filter is safer?
             // Or just specific "Line Removal"?
             
             // Let's try a safe approach: Only remove if vertically or horizontally isolated?
             // Vertical line: Top and Bottom are Black, Left and Right are White.
             // Horizontal line: Left and Right are Black, Top and Bottom are White.
             
             // Let's stick to standard OCR preprocessing: 
             // Usually we don't erode unless we are sure.
             // But the user's debug images show grid lines crossing characters.
             // Tesseract 4/5 (LSTM) is actually okay with some noise.
             // The main issue was likely Padding/Scale/PSM.
             
             // I will comment out the heavy erosion for now and just do a "Speckle Removal"
             // (Remove isolated black pixels).
             
             // Speckle: 0 surrounded by 255s.
             let whiteNeighbors = 0;
             if (data[idx - 4] === 255) whiteNeighbors++; // Left
             if (data[idx + 4] === 255) whiteNeighbors++; // Right
             if (data[idx - width*4] === 255) whiteNeighbors++; // Top
             if (data[idx + width*4] === 255) whiteNeighbors++; // Bottom
             
             if (whiteNeighbors >= 3) {
                output[idx] = 255;
                output[idx+1] = 255;
                output[idx+2] = 255;
             }
          }
       }
    }
  }
  
  ctx.putImageData(new ImageData(output, width, height), 0, 0);
}

// Removed old preprocessImage function as it's replaced by adaptiveThreshold
/*
function preprocessImage(ctx: CanvasRenderingContext2D, width: number, height: number) {
...
}
*/

function detectPieceColor(ctx: CanvasRenderingContext2D, width: number, height: number): PieceColor {
  // Use a larger area (60% instead of 50%) to capture more of the character
  const sampleX = width * 0.2;
  const sampleY = height * 0.2;
  const sampleW = width * 0.6;
  const sampleH = height * 0.6;

  const imgData = ctx.getImageData(sampleX, sampleY, sampleW, sampleH);
  const data = imgData.data;
  
  let redScore = 0;
  let blackScore = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i+1];
    const b = data[i+2];
    
    // Improved Red Detection
    // 1. Bright enough (R > 80)
    // 2. Significantly redder than green/blue (Linear difference is better for dark reds)
    // Old: r > g * 1.5
    // New: r > g + 30 && r > b + 30
    if (r > 80 && (r > g + 30) && (r > b + 30)) {
       redScore++;
    }
    
    // Improved Black Detection
    // 1. Dark enough (R, G, B < 100)
    // 2. Neutral color (Low saturation: R, G, B are close)
    // 3. Avoid dark red being detected as black
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    
    if (r < 100 && g < 100 && b < 100 && (max - min) < 30) {
      blackScore++;
    }
  }
  
  // Weighting: Red pixels are rarer than black (shadows/ink), so give them a slight boost?
  // Actually, let's just trust the counts for now, but with improved thresholds.
  // If we find ANY significant red, it's likely red.
  // Black pieces have almost 0 red pixels.
  // Red pieces have some red pixels.
  
  // Safety: If redScore is significant (e.g. > 1% of pixels), prefer Red.
  // The sample area has sampleW * sampleH pixels.
  const totalPixels = sampleW * sampleH;
  const redThreshold = totalPixels * 0.01; 
  
  if (redScore > redThreshold) return 'w';
  
  // If no significant red, but significant black, return black.
  // Default to Black if uncertain? Or check OCR result?
  // Current logic requires returning a color.
  
  return redScore > blackScore ? 'w' : 'b';
}
