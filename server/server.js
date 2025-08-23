import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import authRoutes from './routes/authRoutes.js';
import meetingRoutes from './routes/meetingRoutes.js';
import pool from './db.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: process.env.CLIENT_ORIGIN, methods: ['GET','POST'] }
});

/**
 * Socket events:
 * - host:join-room (host connects), guests send join-request
 * - server relays popup to host -> host:approve/host:reject
 * - WebRTC signaling: sdp-offer, sdp-answer, ice-candidate
 */
const rooms = new Map(); // roomId -> { hostSocketId, peers: Set }

io.on('connection', (socket) => {
  socket.on('host:join-room', ({ roomId }) => {
    rooms.set(roomId, { hostSocketId: socket.id, peers: new Set() });
    socket.join(roomId);
  });

  socket.on('guest:request-join', async ({ roomId, name, deviceLabel }) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('guest:denied', { reason: 'Room not found' });
    socket.join(roomId);
    io.to(room.hostSocketId).emit('host:join-request', {
      socketId: socket.id, name, deviceLabel
    });
  });

  socket.on('host:approve', ({ guestSocketId }) => {
    const guest = io.sockets.sockets.get(guestSocketId);
    if (guest) {
      guest.emit('guest:approved');
      // keep in room
    }
  });

  socket.on('host:reject', ({ guestSocketId }) => {
    const guest = io.sockets.sockets.get(guestSocketId);
    if (guest) {
      guest.emit('guest:denied', { reason: 'Rejected by host' });
      guest.leave();
    }
  });

  // WebRTC signaling relay
  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('disconnecting', () => {
    // cleanup if host disconnects
    for (const roomId of socket.rooms) {
      const room = rooms.get(roomId);
      if (room && room.hostSocketId === socket.id) {
        io.to(roomId).emit('room:ended');
        rooms.delete(roomId);
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server on :${PORT}`));
