

export async function recognizeBoardViaApi(imageBase64: string): Promise<{ fen: string, layout: string }> {
  try {
    return await window.api.predictBoard(imageBase64);
  } catch (error: any) {
    console.error("Prediction error:", error);
    if (error.message && error.message.includes('Failed to fetch')) {
        throw new Error('无法连接到识别服务器 (http://localhost:8000)。请确保服务器已启动。\nConnection failed. Please ensure the backend server is running on port 8000.');
    }
    throw error;
  }
}
