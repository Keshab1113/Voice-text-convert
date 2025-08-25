import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import io from "socket.io-client";
import { api, setAuth, API_BASE } from "../api";
import QRCodeBox from "../components/QRCodeBox";
import JoinRequestModal from "../components/JoinRequestModal";
import { createHostMixerStream } from "../hooks/useHostMixer";
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaRecordVinyl,
  FaStop,
  FaUpload,
  FaClosedCaptioning,
} from "react-icons/fa";

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];

export default function HostMeeting() {
  const { roomId } = useParams();
  const nav = useNavigate();
  const [requests, setRequests] = useState([]);
  const [recording, setRecording] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioPreviews, setAudioPreviews] = useState(new Map());
  const [showPreview, setShowPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [captions, setCaptions] = useState([]);
  const [showCaptions, setShowCaptions] = useState(false);

  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const peersRef = useRef(new Map());
  const socketRef = useRef(null);
  const addRemoteRef = useRef(null);
  const hasInitializedRef = useRef(false);
  const localMicRef = useRef(null);
  const recordingBlobRef = useRef(null);
  const individualRecordersRef = useRef(new Map());
  const individualChunksRef = useRef(new Map());
  const mixerRef = useRef(null);

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) return nav("/login");
    else setAuth(t);
  }, [nav]);

  const startIndividualRecording = (socketId, stream) => {
    if (individualRecordersRef.current.has(socketId)) return; // FIX: prevent duplicate
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      individualChunksRef.current.set(socketId, blob);
    };
    recorder.start(1000);
    individualRecordersRef.current.set(socketId, recorder);
  };

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const initializeMeeting = async () => {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        localMicRef.current = mic;

        const mixer = await createHostMixerStream(mic);
        mixerRef.current = mixer;
        addRemoteRef.current = mixer.addRemote;

        const sock = io(API_BASE, { transports: ["websocket"] });
        socketRef.current = sock;

        sock.on("host:replaced", () => {
          alert("Another host has joined this room. You've been disconnected.");
          nav("/dashboard");
        });

        sock.on("connect", () => {
          sock.emit("host:join-room", { roomId });
        });

        sock.on("room:count", ({ count }) => {
          setParticipantCount(count);
        });

        sock.on("host:join-request", ({ socketId, name, deviceLabel }) => {
          setRequests((prev) => [...prev, { socketId, name, deviceLabel }]);
        });

        sock.on("signal", async ({ from, data }) => {
          let pc = peersRef.current.get(from);
          if (!pc) {
            pc = new RTCPeerConnection({ iceServers: ICE });

            // Store the remote stream when it becomes available
            const remoteStream = new MediaStream();
            pc.ontrack = (e) => {
              if (e.streams && e.streams[0]) {
                console.log("Received remote track from:", from);

                // Add all tracks from the remote stream to our local stream
                e.streams[0].getTracks().forEach((track) => {
                  remoteStream.addTrack(track);
                });

                addRemoteRef.current(remoteStream, from);

                // Only start recording if we're currently recording
                if (recording) {
                  startIndividualRecording(from, remoteStream);
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
            const answer = await pc.createAnswer({ offerToReceiveAudio: true });
            await pc.setLocalDescription(answer);
            sock.emit("signal", {
              to: from,
              data: { sdp: pc.localDescription },
            });
          } else if (data.candidate) {
            try {
              await pc.addIceCandidate(data.candidate);
            } catch (error) {
              console.error("Error adding ICE candidate:", error);
            }
          }
        });

        const mr = new MediaRecorder(mixer.mixedStream, {
          mimeType: "audio/webm",
        });
        mr.ondataavailable = (e) => {
          if (e.data.size) recordedChunksRef.current.push(e.data);
        };
        mr.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, {
            type: "audio/webm",
          });
          recordingBlobRef.current = blob;

          const previews = new Map();
          previews.set("mixed", URL.createObjectURL(blob));
          individualChunksRef.current.forEach((b, id) => {
            previews.set(id, URL.createObjectURL(b));
          });
          setAudioPreviews(previews);
          setShowPreview(true);
        };
        mediaRecorderRef.current = mr;
      } catch (err) {
        alert("Error starting meeting. Please check your mic permissions.");
      }
    };

    initializeMeeting();

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      if (mediaRecorderRef.current?.state === "recording")
        mediaRecorderRef.current.stop();
      individualRecordersRef.current.forEach(
        (r) => r.state === "recording" && r.stop()
      );
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
    };
  }, [roomId, nav]); // FIX: removed `recording` dependency

  const startRec = () => {
    if (!mediaRecorderRef.current) return;
    recordedChunksRef.current = [];
    individualRecordersRef.current.clear();
    individualChunksRef.current.clear();

    mediaRecorderRef.current.start(1000);
    setRecording(true);
    setShowPreview(false);

    // Start recording host mic
    if (localMicRef.current) {
      startIndividualRecording("host", localMicRef.current);
    }

    // Start recording all existing guest connections
    peersRef.current.forEach((pc, socketId) => {
      // For each peer connection, we need to get their audio stream
      // This assumes you have a way to access the received streams
      const receiverStreams = pc
        .getReceivers()
        .map((receiver) =>
          receiver.track ? new MediaStream([receiver.track]) : null
        )
        .filter((stream) => stream !== null);

      if (receiverStreams.length > 0) {
        const combinedStream = new MediaStream();
        receiverStreams.forEach((stream) => {
          stream.getTracks().forEach((track) => combinedStream.addTrack(track));
        });
        startIndividualRecording(socketId, combinedStream);
      }
    });
  };

  const stopRec = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setRecording(false);
      individualRecordersRef.current.forEach(
        (r) => r.state === "recording" && r.stop()
      );
    }
  };

  const uploadRecording = async () => {
    if (!recordingBlobRef.current && individualChunksRef.current.size === 0)
      return;
    setUploading(true);
    try {
      const formData = new FormData();
      if (recordingBlobRef.current)
        formData.append("mixed", recordingBlobRef.current, "mixed.webm");
      individualChunksRef.current.forEach((b, id) => {
        formData.append(
          "individuals",
          b,
          id === "host" ? "host.webm" : `guest_${id}.webm`
        );
      });
      await api.post(`/meetings/${roomId}/recordings`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await api.post(`/meetings/${roomId}/end`);
      alert("Recordings uploaded.");
      nav("/dashboard");
    } catch {
      alert("Error uploading recordings.");
    } finally {
      setUploading(false);
    }
  };

  const toggleMute = () => {
    if (localMicRef.current) {
      localMicRef.current
        .getAudioTracks()
        .forEach((t) => (t.enabled = !t.enabled));
      setIsMuted(!isMuted);
    }
  };

  const approve = (id) => {
    socketRef.current.emit("host:approve", { guestSocketId: id });
    setRequests((r) => r.filter((x) => x.socketId !== id));
  };
  const reject = (id) => {
    socketRef.current.emit("host:reject", { guestSocketId: id });
    setRequests((r) => r.filter((x) => x.socketId !== id));
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">
          Host Room: {roomId}
        </h1>

        <div className="flex flex-col md:flex-row gap-6 mb-6">
          <QRCodeBox roomId={roomId} />

          <div className="flex-1">
            <div className="flex flex-wrap gap-3 items-center mb-4">
              <button
                className={`px-4 py-2 rounded flex items-center gap-2 ${
                  isMuted ? "bg-gray-600" : "bg-blue-600 hover:bg-blue-700"
                } text-white`}
                onClick={toggleMute}
              >
                {isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
                {isMuted ? "Unmute" : "Mute"}
              </button>

              {!recording ? (
                <button
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2"
                  onClick={startRec}
                >
                  <FaRecordVinyl /> Start Recording
                </button>
              ) : (
                <button
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2"
                  onClick={stopRec}
                >
                  <FaStop /> Stop Recording
                </button>
              )}
              <button
                className={`px-4 py-2 rounded flex items-center gap-2 ${
                  showCaptions ? "bg-purple-600" : "bg-gray-600"
                } text-white hover:bg-purple-700`}
                onClick={() => setShowCaptions(!showCaptions)}
              >
                <FaClosedCaptioning />{" "}
                {showCaptions ? "Hide Captions" : "Show Captions"}
              </button>
              <span className="text-lg font-semibold bg-gray-200 px-3 py-1 rounded">
                Participants: {participantCount}
              </span>
            </div>

            {showPreview && audioPreviews.size > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <h3 className="font-medium text-gray-700 mb-2">
                  Recording Previews
                </h3>

                {/* Mixed recording */}
                <div className="mb-4">
                  <h4 className="font-medium text-gray-600 mb-1">
                    Mixed Audio
                  </h4>
                  <audio
                    controls
                    src={audioPreviews.get("mixed")}
                    className="w-full"
                  />
                </div>

                {/* Individual recordings */}
                <div>
                  <h4 className="font-medium text-gray-600 mb-2">
                    Individual Recordings
                  </h4>
                  <div className="space-y-3">
                    {Array.from(audioPreviews.entries()).map(
                      ([socketId, url]) => {
                        if (socketId === "mixed") return null;

                        const participantName =
                          socketId === "host"
                            ? "Host"
                            : `Guest ${socketId.slice(0, 8)}`;

                        return (
                          <div key={socketId} className="border rounded p-3">
                            <h5 className="font-medium text-sm mb-1">
                              {participantName}
                            </h5>
                            <audio controls src={url} className="w-full" />
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>

                <button
                  onClick={uploadRecording}
                  disabled={uploading}
                  className="mt-4 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-purple-400 flex items-center gap-2"
                >
                  <FaUpload />{" "}
                  {uploading ? "Uploading..." : "Upload All Recordings"}
                </button>
              </div>
            )}

            {showCaptions && (
              <div className="bg-gray-800 text-white p-4 rounded-lg mb-4 max-h-48 overflow-y-auto">
                <h3 className="font-medium mb-2">Live Captions</h3>
                <div className="space-y-2">
                  {captions.map((caption, index) => (
                    <div
                      key={index}
                      className={`p-2 rounded ${
                        caption.isFinal
                          ? "bg-gray-700"
                          : "bg-gray-600 opacity-75"
                      }`}
                    >
                      {caption.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <JoinRequestModal
          reqs={requests}
          onApprove={approve}
          onReject={reject}
        />
      </div>
    </div>
  );
}
