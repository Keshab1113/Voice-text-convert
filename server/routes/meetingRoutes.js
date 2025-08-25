import express from "express";
import multer from "multer";
import path from "path";
import {
  authMiddleware,
  createMeeting,
  endMeeting,
} from "../controllers/meetingController.js";
import pool from "../db.js";
import { transcribeFile } from "../services/deepgram.js";

const router = express.Router();
const upload = multer({
  dest: path.join(process.cwd(), "server", "uploads"),
});
router.post("/", authMiddleware, createMeeting);
router.post("/:roomId/end", authMiddleware, endMeeting);

router.post(
  "/:roomId/recordings",
  authMiddleware,
  upload.fields([
    { name: "mixed", maxCount: 1 },
    { name: "individuals", maxCount: 20 },
  ]),
  async (req, res) => {
    const { roomId } = req.params;
    const [rows] = await pool.query("SELECT id FROM meetings WHERE room_id=?", [
      roomId,
    ]);
    if (!rows.length)
      return res.status(404).json({ message: "Meeting not found" });
    const meetingId = rows[0].id;

    try {
      // Process mixed recording
      if (req.files.mixed) {
        const mixedFile = req.files.mixed[0];
        const mixedTranscript = await transcribeFile(
          mixedFile.path,
          mixedFile.mimetype
        );

        await pool.query(
          "INSERT INTO recordings (meeting_id, file_path, mime_type, type) VALUES (?,?,?,?)",
          [meetingId, mixedFile.path, mixedFile.mimetype, "mixed"]
        );

        if (mixedTranscript) {
          await pool.query(
            "INSERT INTO transcripts (meeting_id, transcript, type) VALUES (?,?,?)",
            [meetingId, mixedTranscript, "mixed"]
          );
        }
      }

      // Process individual recordings
      if (req.files.individuals) {
        for (const file of req.files.individuals) {
          const individualTranscript = await transcribeFile(
            file.path,
            file.mimetype
          );

          await pool.query(
            "INSERT INTO recordings (meeting_id, file_path, mime_type, type) VALUES (?,?,?,?)",
            [meetingId, file.path, file.mimetype, "individual"]
          );

          if (individualTranscript) {
            await pool.query(
              "INSERT INTO transcripts (meeting_id, transcript, type) VALUES (?,?,?)",
              [meetingId, individualTranscript, "individual"]
            );
          }
        }
      }

      res.json({ ok: true, message: "All recordings processed" });
    } catch (error) {
      console.error("Error processing recordings:", error);
      res.status(500).json({ message: "Error processing recordings" });
    }
  }
);

export default router;
