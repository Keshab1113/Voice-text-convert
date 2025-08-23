import pool from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

export const authMiddleware = (req, res, next) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export const createMeeting = async (req, res) => {
  const room_id = uuidv4();
  const title = req.body?.title || 'Untitled Meeting';
  const [r] = await pool.query(
    'INSERT INTO meetings (room_id, host_user_id, title) VALUES (?,?,?)',
    [room_id, req.user.id, title]
  );
  res.json({ roomId: room_id, meetingId: r.insertId });
};

export const endMeeting = async (req, res) => {
  const { roomId } = req.params;
  await pool.query('UPDATE meetings SET status="ended", ended_at=NOW() WHERE room_id=?', [roomId]);
  res.json({ ok: true });
};
