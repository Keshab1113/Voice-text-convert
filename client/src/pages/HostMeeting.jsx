import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import io from "socket.io-client";
import { api, setAuth, API_BASE } from "../api";
import QRCodeBox from "../components/QRCodeBox";
import JoinRequestModal from "../components/JoinRequestModal";
import { createHostMixerStream } from "../hooks/useHostMixer";

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];

export default function HostMeeting() {
  const { roomId } = useParams();
  const nav = useNavigate();
  const [requests, setRequests] = useState([]);
  const [recording, setRecording] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const peersRef = useRef(new Map());
  const socketRef = useRef(null);
  const addRemoteRef = useRef(null);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) return nav("/login");
    else setAuth(t);
  }, [nav]);

  useEffect(() => {
    // Prevent multiple initializations
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    console.log("Initializing host meeting...");

    const initializeMeeting = async () => {
      try {
        // 1. Get user media first
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        const { mixedStream, addRemote } = await createHostMixerStream(mic);
        addRemoteRef.current = addRemote;

        // 2. Create SINGLE socket connection
        const sock = io(API_BASE, { transports: ["websocket"] });
        socketRef.current = sock;

        // 3. Set up all socket event listeners
        sock.on("host:replaced", () => {
          console.warn("Another host has taken over this room");
          alert("Another host has joined this room. You've been disconnected.");
          nav("/dashboard");
        });

        sock.on("connect", () => {
          console.log("Socket connected with ID:", sock.id);
          sock.emit("host:join-room", { roomId });
        });

        sock.on("room:count", ({ count }) => {
          console.log("ROOM COUNT RECEIVED:", count);
          setParticipantCount(count);
        });

        sock.on("host:join-request", ({ socketId, name, deviceLabel }) => {
          console.log("Join request received from:", socketId);
          setRequests((prev) => [...prev, { socketId, name, deviceLabel }]);
        });

        sock.on("signal", async ({ from, data }) => {
          console.log("Signal received from:", from);
          let pc = peersRef.current.get(from);
          if (!pc) {
            pc = new RTCPeerConnection({ iceServers: ICE });
            pc.ontrack = (e) => {
              if (e.streams && e.streams[0]) {
                if (addRemoteRef.current) {
                  addRemoteRef.current(e.streams[0]);
                }
              }
            };
            peersRef.current.set(from, pc);
            pc.onicecandidate = (ev) => {
              if (ev.candidate) {
                sock.emit("signal", {
                  to: from,
                  data: { candidate: ev.candidate },
                });
              }
            };
          }

          if (data.sdp) {
            await pc.setRemoteDescription(data.sdp);
            const answer = await pc.createAnswer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: false,
            });
            await pc.setLocalDescription(answer);
            sock.emit("signal", { to: from, data: { sdp: pc.localDescription } });
          } else if (data.candidate) {
            try {
              await pc.addIceCandidate(data.candidate);
            } catch (error) {
              console.log("Error adding ICE candidate:", error);
            }
          }
        });

        sock.on("connect_error", (error) => {
          console.error("Socket connection error:", error);
        });

        // 4. Setup media recorder
        const mr = new MediaRecorder(mixedStream, { mimeType: "audio/webm" });
        recordedChunksRef.current = [];
        mr.ondataavailable = (e) => {
          if (e.data.size) recordedChunksRef.current.push(e.data);
        };
        mr.onstop = async () => {
          const blob = new Blob(recordedChunksRef.current, {
            type: "audio/webm",
          });
          const file = new File([blob], "meeting.webm", { type: "audio/webm" });
          const form = new FormData();
          form.append("audio", file);
          try {
            await api.post(`/meetings/${roomId}/recording`, form, {
              headers: { "Content-Type": "multipart/form-data" },
            });
            await api.post(`/meetings/${roomId}/end`);
            alert("Uploaded & transcribed.");
            nav("/dashboard");
          } catch (error) {
            console.error("Error uploading recording:", error);
            alert("Error uploading recording. Please try again.");
          }
        };
        mediaRecorderRef.current = mr;

      } catch (error) {
        console.error("Error initializing meeting:", error);
        alert("Error starting meeting. Please check your microphone permissions.");
      }
    };

    initializeMeeting();

    return () => {
      console.log("Cleaning up host meeting...");
      try {
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
        // Stop all media tracks
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
        }
        // Close all peer connections
        peersRef.current.forEach((pc) => pc.close());
        peersRef.current.clear();
      } catch (error) {
        console.error("Error during cleanup:", error);
      }
    };
  }, [roomId, nav]); // Add all dependencies

  const approve = (guestSocketId) => {
    if (socketRef.current) {
      socketRef.current.emit("host:approve", { guestSocketId });
      setRequests((reqs) => reqs.filter((r) => r.socketId !== guestSocketId));
    }
  };

  const reject = (guestSocketId) => {
    if (socketRef.current) {
      socketRef.current.emit("host:reject", { guestSocketId });
      setRequests((reqs) => reqs.filter((r) => r.socketId !== guestSocketId));
    }
  };

  const startRec = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.start(1000);
      setRecording(true);
    }
  };

  const stopRec = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Host Room: {roomId}</h1>
      <QRCodeBox roomId={roomId} />
      <div className="flex gap-2 items-center">
        {!recording ? (
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={startRec}
          >
            Start Recording
          </button>
        ) : (
          <button
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            onClick={stopRec}
          >
            Stop & Upload
          </button>
        )}
        <span className="text-lg font-semibold">
          Participants: {participantCount}
        </span>
      </div>
      <JoinRequestModal reqs={requests} onApprove={approve} onReject={reject} />
    </div>
  );
}