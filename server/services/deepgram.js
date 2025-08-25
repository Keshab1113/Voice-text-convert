import fs from "fs";
import fetch from "node-fetch"; // npm install node-fetch if not using Node 18+
const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY;

/**
 * Send a prerecorded audio file to Deepgram for transcription.
 * Works with wav, mp3, webm, ogg — Deepgram auto-detects format.
 */
export async function transcribeFile(filePath, mimeType = "") {
  const DEEPGRAM_URL = process.env.DEEPGRAM_URL || "https://api.deepgram.com/v1/listen?model=nova-3";
  const audioBuffer = fs.readFileSync(filePath);

  const res = await fetch(DEEPGRAM_URL, {
    method: "POST",
    headers: {
      Authorization: `Token ${DEEPGRAM_KEY}`,
      "Content-Type": mimeType || "audio/webm",
    },
    body: audioBuffer,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Deepgram API error: ${res.status} ${res.statusText}: ${text}`);
  }

  const data = await res.json();
  return data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
}

