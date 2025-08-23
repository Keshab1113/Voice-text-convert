import fs from 'fs';
import WebSocket from 'ws';

const DEEPGRAM_URL = process.env.DEEPGRAM_URL || "wss://api.deepgram.com/v1/listen?model=nova-3";
const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY;

export async function transcribeFile(filePath) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(DEEPGRAM_URL, {
      headers: { Authorization: `Token ${DEEPGRAM_KEY}` }
    });

    let transcript = "";

    ws.on('open', () => {
      // Read file and stream to Deepgram
      const stream = fs.createReadStream(filePath);
      stream.on('data', chunk => ws.send(chunk));
      stream.on('end', () => ws.send(Buffer.from([]))); // end of stream
    });

    ws.on('message', (message) => {
      try {
        const msg = JSON.parse(message.toString());
        if (msg.is_final) {
          // Concatenate transcript chunks
          transcript += (msg.channel?.alternatives?.[0]?.transcript || "") + " ";
        }
      } catch (err) {
        console.error("Parse error:", err);
      }
    });

    ws.on('close', () => {
      resolve(transcript.trim());
    });

    ws.on('error', (err) => reject(err));
  });
}
