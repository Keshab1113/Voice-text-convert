import express from 'express';
import multer from 'multer';
import path from 'path';
import { authMiddleware, createMeeting, endMeeting } from '../controllers/meetingController.js';
import pool from '../db.js';
import { transcribeFile } from '../services/deepgram.js';

const router = express.Router();
const upload = multer({
  dest: path.join(process.cwd(), 'server', 'uploads')
});

// Create meeting
router.post('/', authMiddleware, createMeeting);

// End meeting
router.post('/:roomId/end', authMiddleware, endMeeting);

// Save recording (host uploads single mixed file)
router.post('/:roomId/recording', authMiddleware, upload.single('audio'), async (req, res) => {
  const { roomId } = req.params;
  const [rows] = await pool.query('SELECT id FROM meetings WHERE room_id=?', [roomId]);
  if (!rows.length) return res.status(404).json({ message: 'Meeting not found' });
  const meetingId = rows[0].id;

  const filePath = req.file.path;
  const mimeType = req.file.mimetype;

  await pool.query(
    'INSERT INTO recordings (meeting_id, file_path, mime_type) VALUES (?,?,?)',
    [meetingId, filePath, mimeType]
  );

  // Transcribe with Deepgram
  let transcript = '';
  try {
    transcript = await transcribeFile(filePath, mimeType);
  } catch (e) {
    console.error('Deepgram error', e);
  }

  if (transcript) {
    await pool.query(
      'INSERT INTO transcripts (meeting_id, transcript) VALUES (?,?)',
      [meetingId, transcript]
    );
  }

  res.json({ ok: true, transcriptSaved: !!transcript });
});

export default router;
