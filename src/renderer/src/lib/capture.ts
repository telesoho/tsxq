
export async function captureSource(sourceId: string): Promise<string> {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                    minWidth: 0,
                    maxWidth: 4000,
                    minHeight: 0,
                    maxHeight: 4000
                }
            }
        } as any);

        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.style.display = 'none';
            
            // Timeout to reject if it hangs
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('Capture timeout'));
            }, 5000);

            const cleanup = () => {
                clearTimeout(timeout);
                stream.getTracks().forEach(track => track.stop());
                video.remove();
            };

            video.onloadedmetadata = () => {
                video.play().then(() => {
                    // Wait a short moment to ensure the frame is rendered
                    setTimeout(() => {
                        try {
                            const canvas = document.createElement('canvas');
                            canvas.width = video.videoWidth;
                            canvas.height = video.videoHeight;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) {
                                throw new Error('Could not get canvas context');
                            }
                            
                            ctx.drawImage(video, 0, 0);
                            const dataUrl = canvas.toDataURL('image/png');
                            
                            cleanup();
                            resolve(dataUrl);
                        } catch (e) {
                            cleanup();
                            reject(e);
                        }
                    }, 300); // 300ms delay to ensure we don't get a black frame
                }).catch(e => {
                    cleanup();
                    reject(e);
                });
            };

            video.onerror = (e) => {
                cleanup();
                reject(e);
            };

            video.srcObject = stream;
            document.body.appendChild(video);
        });
    } catch (e) {
        throw new Error(`Failed to capture source ${sourceId}: ${e}`);
    }
}
