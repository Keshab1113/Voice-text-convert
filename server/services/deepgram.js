import { createClient } from '@deepgram/sdk';
import fs from 'fs';

const dg = createClient(process.env.DEEPGRAM_API_KEY);

export async function transcribeFile(filePath, mimetype) {
  const source = { buffer: fs.readFileSync(filePath), mimetype };
  const resp = await dg.transcription.preRecorded(
    { buffer: source.buffer, mimetype: source.mimetype },
    { model: 'nova-2', smart_format: true, diarize: true }
  );
  // You can inspect resp for diarization; simplest text:
  const text = resp?.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  return text;
}
