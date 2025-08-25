import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import authRoutes from "./routes/authRoutes.js";
import meetingRoutes from "./routes/meetingRoutes.js";
import pool from "./db.js";
import WebSocket from "ws";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/meetings", meetingRoutes);

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: process.env.CLIENT_ORIGIN, methods: ["GET", "POST"] },
});

// ---- Rooms and Live Caption Streams ----
const rooms = new Map(); // roomId -> { hostSocketId, peers: Map<socketId, info> }
const liveStreams = new Map(); // roomId -> { ws, queue: Buffer[], open: boolean }

function openDeepgramWS(roomId) {
  // Expect 16kHz PCM Int16 chunks from the client for best results
  // If you send WebM/Opus from the client, change query params accordingly.
  const DG_URL =
    process.env.DEEPGRAM_URL ||
    "wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16&sample_rate=16000&interim_results=true&punctuate=true&smart_format=true";

  const ws = new WebSocket(DG_URL, {
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
  });

  const state = { ws, queue: [], open: false };
  liveStreams.set(roomId, state);

  ws.on("open", () => {
    state.open = true;
    // Flush anything that arrived before open
    for (const chunk of state.queue) ws.send(chunk);
    state.queue.length = 0;
  });

  ws.on("message", (message) => {
    try {
      const msg = JSON.parse(message.toString());
      // Deepgram messages can include lots of events; focus on transcripts
      const alt = msg?.channel?.alternatives?.[0];
      if (!alt) return;
      const text = alt.transcript || "";
      if (!text) return;

      // Emit as { text, isFinal }
      const isFinal =
        msg.is_final === true ||
        msg.speech_final === true ||
        msg.type === "UtteranceEnd";
      io.to(roomId).emit("caption", { text, isFinal });
    } catch (e) {
      console.error("Deepgram parse error:", e);
    }
  });

  ws.on("error", (err) => {
    console.error(`Deepgram WS error (room ${roomId}):`, err);
  });

  ws.on("close", () => {
    liveStreams.delete(roomId);
    console.log(`Deepgram WS closed for room ${roomId}`);
  });

  return state;
}

function closeDeepgramWS(roomId) {
  const s = liveStreams.get(roomId);
  if (!s) return;
  try {
    // Send an empty buffer to signal EOF, then close after a short delay
    if (s.open) s.ws.send(Buffer.from([]));
    s.ws.close();
  } catch (e) {
    console.error("Error closing Deepgram WS:", e);
  } finally {
    liveStreams.delete(roomId);
  }
}

// ---------------------------------------

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
    socket.data.roomId = roomId; // <-- keep room on socket
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
    socket.data.roomId = roomId; // <-- keep room on socket
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
    console.log(
      `Signal from ${socket.id} to ${to}, type:`,
      data.sdp ? "SDP" : data.candidate ? "ICE" : "Unknown"
    );
    io.to(to).emit("signal", { from: socket.id, data });
  });

  // In the audio-chunk event handler, modify it to:
  socket.on("audio-chunk", async (chunkData) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    let state = liveStreams.get(roomId);
    if (!state) {
      console.log(`Starting Deepgram live stream for room ${roomId}`);
      state = openDeepgramWS(roomId);
    }

    // Convert ArrayBuffer to Buffer if needed
    const chunk = Buffer.isBuffer(chunkData)
      ? chunkData
      : Buffer.from(chunkData);

    // Send/queue chunk
    if (state.open) {
      try {
        state.ws.send(chunk);
      } catch (e) {
        console.error("Error sending chunk to Deepgram:", e);
      }
    } else {
      state.queue.push(chunk);
    }
  });

  socket.on("disconnecting", () => {
    console.log(`Client disconnecting: ${socket.id}`);
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;

      const room = rooms.get(roomId);
      if (!room) continue;

      if (room.peers.has(socket.id)) {
        room.peers.delete(socket.id);
        console.log(
          `Guest ${socket.id} left room ${roomId}, new count: ${room.peers.size}`
        );
        io.to(room.hostSocketId).emit("room:count", { count: room.peers.size });
      }

      if (room.hostSocketId === socket.id) {
        console.log(`Host ${socket.id} ended room ${roomId}`);
        io.to(roomId).emit("room:ended");
        rooms.delete(roomId);
        // Close live captions stream for this room
        closeDeepgramWS(roomId);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server on :${PORT}`));
