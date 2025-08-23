import React, { useEffect, useMemo, useRef, useState } from "react";
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
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const peersRef = useRef(new Map()); // guestSocketId -> RTCPeerConnection
  const socketRef = useRef(null);
  const addRemoteRef = useRef(null);
  const [participantCount, setParticipantCount] = useState(0);

  useEffect(() => {
    if (!socketRef.current) return;

    const handleRoomCount = ({ count }) => {
      setParticipantCount(count);
      console.log("participantCount: ", count);
    };

    socketRef.current.on("room:count", handleRoomCount);

    return () => {
      if (socketRef.current) {
        socketRef.current.off("room:count", handleRoomCount);
      }
    };
  }, []);

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) return nav("/login");
    else setAuth(t);
  }, []);

  useEffect(() => {
    (async () => {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      const { mixedStream, addRemote } = await createHostMixerStream(mic);
      addRemoteRef.current = addRemote;

      const sock = io(API_BASE, { transports: ["websocket"] });
      socketRef.current = sock;

      sock.emit("host:join-room", { roomId });

      sock.on("host:join-request", ({ socketId, name, deviceLabel }) => {
        setRequests((prev) => [...prev, { socketId, name, deviceLabel }]);
      });

      sock.on("signal", async ({ from, data }) => {
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
            if (ev.candidate)
              sock.emit("signal", {
                to: from,
                data: { candidate: ev.candidate },
              });
          };
        }

        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp);
          const answer = await pc.createAnswer({
            offerToReceiveAudio: true, // Add this
            offerToReceiveVideo: false,
          });
          await pc.setLocalDescription(answer);
          sock.emit("signal", { to: from, data: { sdp: pc.localDescription } });
        } else if (data.candidate) {
          try {
            await pc.addIceCandidate(data.candidate);
          } catch (error) {
            console.log("Error in HostMeeting.jsx: ", error);
          }
        }
      });
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
        await api.post(`/meetings/${roomId}/recording`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        await api.post(`/meetings/${roomId}/end`);
        alert("Uploaded & transcribed.");
        nav("/dashboard");
      };
      mediaRecorderRef.current = mr;
    })();

    return () => {
      try {
        socketRef.current?.disconnect();
      } catch {}
    };
  }, [roomId]);

  const approve = (guestSocketId) => {
    socketRef.current.emit("host:approve", { guestSocketId });
    setRequests((reqs) => reqs.filter((r) => r.socketId !== guestSocketId));
  };
  const reject = (guestSocketId) => {
    socketRef.current.emit("host:reject", { guestSocketId });
    setRequests((reqs) => reqs.filter((r) => r.socketId !== guestSocketId));
  };

  const startRec = () => {
    mediaRecorderRef.current?.start(1000);
    setRecording(true);
  };
  const stopRec = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Host Room: {roomId}</h1>
      <QRCodeBox roomId={roomId} />
      <div className="flex gap-2">
        {!recording ? (
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded"
            onClick={startRec}
          >
            Start Recording
          </button>
        ) : (
          <button
            className="px-4 py-2 bg-red-600 text-white rounded"
            onClick={stopRec}
          >
            Stop & Upload
          </button>
        )}
        <h1 className="text-xl font-semibold">
          Host Room: {roomId} — Participants: {participantCount}
        </h1>
      </div>
      <JoinRequestModal reqs={requests} onApprove={approve} onReject={reject} />
    </div>
  );
}
