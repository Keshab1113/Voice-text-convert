import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import authRoutes from "./routes/authRoutes.js";
import meetingRoutes from "./routes/meetingRoutes.js";
import pool from "./db.js";

const app = express();
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
  console.log(`Client connected: ${socket.id}`);

  socket.on("host:join-room", ({ roomId }) => {
    // Check if room already has a host
    if (rooms.has(roomId)) {
      const existingRoom = rooms.get(roomId);
      // If this socket is not the current host, disconnect the previous host
      if (existingRoom.hostSocketId !== socket.id) {
        const previousHost = io.sockets.sockets.get(existingRoom.hostSocketId);
        if (previousHost) {
          previousHost.emit("host:replaced");
          previousHost.leave(roomId);
        }
      }
    }

    // Create or update room
    rooms.set(roomId, {
      hostSocketId: socket.id,
      peers: rooms.get(roomId)?.peers || new Map(),
    });

    socket.join(roomId);
    console.log(
      `Host ${socket.id} joined room ${roomId}, total peers: ${
        rooms.get(roomId).peers.size
      }`
    );

    // Send current count to the new host
    io.to(socket.id).emit("room:count", {
      count: rooms.get(roomId).peers.size,
    });
  });

  socket.on("guest:request-join", async ({ roomId, name, deviceLabel }) => {
    console.log(`Guest ${socket.id} requesting to join room ${roomId}`);
    const room = rooms.get(roomId);
    if (!room) {
      console.log(`Room ${roomId} not found`);
      return socket.emit("guest:denied", { reason: "Room not found" });
    }
    
    socket.join(roomId);
    room.peers.set(socket.id, { name, deviceLabel });

    // Send host socket ID to the guest so they know where to send signals
    socket.emit("host:socket-id", { hostId: room.hostSocketId });
    console.log(`Sent host ID ${room.hostSocketId} to guest ${socket.id}`);

    io.to(room.hostSocketId).emit("host:join-request", {
      socketId: socket.id,
      name,
      deviceLabel,
    });
    
    console.log(
      `Emitting room:count to host ${room.hostSocketId}, count: ${room.peers.size}`
    );
    io.to(room.hostSocketId).emit("room:count", { count: room.peers.size });
  });

  socket.on("host:approve", async ({ guestSocketId }) => {
    console.log(`Host approving guest: ${guestSocketId}`);
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
            const peerInfo = room.peers.get(guestSocketId);
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
      console.log(`Guest ${guestSocketId} approved`);
    }
  });

  socket.on("host:reject", ({ guestSocketId }) => {
    console.log(`Host rejecting guest: ${guestSocketId}`);
    const guest = io.sockets.sockets.get(guestSocketId);
    if (guest) {
      guest.emit("guest:denied", { reason: "Rejected by host" });
      guest.leave();
    }
  });

  socket.on("signal", ({ to, data }) => {
    console.log(`Signal from ${socket.id} to ${to}, type:`, data.sdp ? 'SDP' : data.candidate ? 'ICE' : 'Unknown');
    io.to(to).emit("signal", { from: socket.id, data });
  });

  socket.on("disconnecting", () => {
    console.log(`Client disconnecting: ${socket.id}`);
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;

      const room = rooms.get(roomId);
      if (!room) continue;

      if (room.peers.has(socket.id)) {
        room.peers.delete(socket.id);
        console.log(`Guest ${socket.id} left room ${roomId}, new count: ${room.peers.size}`);
        io.to(room.hostSocketId).emit("room:count", { count: room.peers.size });
      }

      if (room.hostSocketId === socket.id) {
        console.log(`Host ${socket.id} ended room ${roomId}`);
        io.to(roomId).emit("room:ended");
        rooms.delete(roomId);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server on :${PORT}`));