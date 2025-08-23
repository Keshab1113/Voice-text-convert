import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import authRoutes from "./routes/authRoutes.js";
import meetingRoutes from "./routes/meetingRoutes.js";
import pool from "./db.js";

const app = express();
// app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/meetings", meetingRoutes);

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: process.env.CLIENT_ORIGIN, methods: ["GET", "POST"] },
});

const rooms = new Map();

io.on("connection", (socket) => {
  socket.on("host:join-room", ({ roomId }) => {
    rooms.set(roomId, { hostSocketId: socket.id, peers: new Map() });
    socket.join(roomId);
  });

  socket.on("guest:request-join", async ({ roomId, name, deviceLabel }) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit("guest:denied", { reason: "Room not found" });
    socket.join(roomId);

    // Fix: Use Map.set() instead of Set.add()
    room.peers.set(socket.id, { name, deviceLabel }); // Changed from .add()

    io.to(room.hostSocketId).emit("host:join-request", {
      socketId: socket.id,
      name,
      deviceLabel,
    });
    io.to(room.hostSocketId).emit("room:count", { count: room.peers.size });
  });

  socket.on("host:approve", async ({ guestSocketId }) => {
    const guest = io.sockets.sockets.get(guestSocketId);
    if (guest) {
      const roomId = [...guest.rooms].find((r) => r !== guest.id);
      if (roomId) {
        try {
          const [rows] = await pool.query(
            "SELECT id FROM meetings WHERE room_id=?",
            [roomId]
          );
          if (rows.length) {
            const meetingId = rows[0].id;
            const room = rooms.get(roomId);
            const peerInfo = room.peers.get(guestSocketId); // Changed from [...room.peers].find()
            const name = peerInfo?.name || "Guest";
            const deviceLabel = peerInfo?.deviceLabel || "";
            await pool.query(
              "INSERT INTO participants (meeting_id, socket_id, name, device_label) VALUES (?,?,?,?)",
              [meetingId, guestSocketId, name, deviceLabel]
            );
          }
        } catch (err) {
          console.error("Error inserting participant:", err);
        }
      }
      guest.emit("guest:approved");
    }
  });

  socket.on("host:reject", ({ guestSocketId }) => {
    const guest = io.sockets.sockets.get(guestSocketId);
    if (guest) {
      guest.emit("guest:denied", { reason: "Rejected by host" });
      guest.leave();
    }
  });
  socket.on("signal", ({ to, data }) => {
    io.to(to).emit("signal", { from: socket.id, data });
  });

  socket.on("disconnecting", () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue; // Skip the default room

      const room = rooms.get(roomId);
      if (!room) continue;

      if (room.peers.has(socket.id)) {
        room.peers.delete(socket.id);
        io.to(room.hostSocketId).emit("room:count", { count: room.peers.size });
      }

      if (room.hostSocketId === socket.id) {
        io.to(roomId).emit("room:ended");
        rooms.delete(roomId);
      }
    }
  });
});
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server on :${PORT}`));
