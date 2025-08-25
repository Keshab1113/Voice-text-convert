import fs from "fs";
import WebSocket from "ws";

const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY;

// Pick suitable query params based on mime type
function inferListenURL(mime = "") {
  const base = "wss://api.deepgram.com/v1/listen";
  const params = new URLSearchParams({
    model: "nava-2", // or nova-3 if available for prerecorded; both are fine
    punctuate: "true",
    smart_format: "true",
  });

  const m = mime.toLowerCase();
  if (m.includes("wav") || m.includes("x-wav") || m.includes("pcm")) {
    params.set("encoding", "linear16");
    params.set("sample_rate", "16000"); // adjust if you know the real rate
  } else if (m.includes("webm")) {
    params.set("encoding", "webm");
    params.set("sample_rate", "48000"); // common for webm/opus
  } else if (m.includes("ogg")) {
    params.set("encoding", "ogg");
    params.set("sample_rate", "48000");
  } else if (m.includes("mp3")) {
    params.set("encoding", "mp3");
  }
  return `${base}?${params.toString()}`;
}

/**
 * Stream a local audio file to Deepgram via WS and collect the transcript.
 * Works with webm/opus, wav/pcm, ogg, mp3 (depending on your Deepgram plan).
 */
export async function transcribeFile(filePath, mimeType = "") {
  const url = inferListenURL(mimeType);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: { Authorization: `Token ${DEEPGRAM_KEY}` },
    });

    let transcript = "";

    ws.on("open", () => {
      const stream = fs.createReadStream(filePath);
      stream.on("data", (chunk) => ws.send(chunk));
      stream.on("end", () => {
        // Signal EOF
        try {
          ws.send(Buffer.from([]));
        } catch {}
      });
    });

    ws.on("message", (message) => {
      try {
        const msg = JSON.parse(message.toString());
        if (msg.is_final) {
          transcript += (msg.channel?.alternatives?.[0]?.transcript || "") + " ";
        }
      } catch (err) {
        console.error("Deepgram parse error:", err);
      }
    });

    ws.on("close", () => {
      resolve(transcript.trim());
    });

    ws.on("error", (err) => reject(err));
  });
}
