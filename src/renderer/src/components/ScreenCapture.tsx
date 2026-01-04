import { useState, useEffect, useRef } from 'react';

interface ScreenCaptureProps {
  onCapture: (imageData: string) => void;
  onCancel: () => void;
}

export const ScreenCapture: React.FC<ScreenCaptureProps> = ({ onCapture, onCancel }) => {
  const [sources, setSources] = useState<any[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  useEffect(() => {
    // Get available screen sources from main process
    window.api.getScreenSources().then((sources: any[]) => {
      setSources(sources);
      if (sources.length > 0) {
        setSelectedSourceId(sources[0].id);
      }
    });
  }, []);

  const startStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSourceId,
            minWidth: 1280,
            maxWidth: 4000,
            minHeight: 720,
            maxHeight: 4000
          }
        } as any
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsSelecting(true);
      }
    } catch (e) {
      console.error('Error accessing screen:', e);
    }
  };

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        onCapture(dataUrl);
        
        // Stop all tracks
        const stream = video.srcObject as MediaStream;
        stream?.getTracks().forEach(track => track.stop());
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-4 rounded w-full max-w-4xl max-h-[90vh] flex flex-col">
        <h2 className="text-xl font-bold mb-4">Select Screen to Analyze</h2>
        
        {!isSelecting ? (
          <div className="flex flex-col gap-4">
             <div className="grid grid-cols-2 gap-4 max-h-96 overflow-auto">
               {sources.map(source => (
                 <div 
                   key={source.id} 
                   className={`p-2 border rounded cursor-pointer hover:bg-blue-50 ${selectedSourceId === source.id ? 'border-blue-500 ring-2 ring-blue-200' : ''}`}
                   onClick={() => setSelectedSourceId(source.id)}
                 >
                   <img src={source.thumbnail} alt={source.name} className="w-full h-32 object-contain mb-2 bg-gray-100" />
                   <p className="text-center text-sm truncate">{source.name}</p>
                 </div>
               ))}
             </div>
             <div className="flex justify-end gap-2 mt-4">
               <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
               <button onClick={startStream} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Next</button>
             </div>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="relative border border-gray-300 bg-black max-h-[60vh] overflow-hidden mb-4">
              <video ref={videoRef} className="max-w-full max-h-full" />
            </div>
            <p className="mb-4 text-sm text-gray-500">Ensure the Xiangqi board is clearly visible.</p>
            <div className="flex gap-2">
              <button onClick={() => setIsSelecting(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Back</button>
              <button onClick={handleCapture} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Capture & Analyze</button>
            </div>
          </div>
        )}
        
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
};
