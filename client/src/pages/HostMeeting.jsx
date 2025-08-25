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
  const [transcript, setTranscript] = useState("");
  const [showEndButton, setShowEndButton] = useState(false);

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
  const audioIntervalsRef = useRef(new Map());

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) return nav("/login");
    else setAuth(t);
  }, [nav]);

  const startIndividualRecording = (socketId, stream) => {
    console.log(`Starting recording for ${socketId}`);
    console.log(`Stream tracks for ${socketId}:`, stream.getTracks());
    console.log(`Stream active for ${socketId}:`, stream.active);

    stream.getTracks().forEach((track) => {
      console.log(`Track ${track.id} enabled:`, track.enabled);
      console.log(`Track ${track.id} readyState:`, track.readyState);
      console.log(`Track ${track.id} muted:`, track.muted);
    });

    if (individualRecordersRef.current.has(socketId)) {
      const existingRecorder = individualRecordersRef.current.get(socketId);
      if (existingRecorder.state === "recording") {
        console.log(`Stopping existing recorder for ${socketId}`);
        existingRecorder.stop();
      }
      individualRecordersRef.current.delete(socketId);
    }

    try {
      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
        audioBitsPerSecond: 128000,
      });

      const chunks = [];

      recorder.ondataavailable = (e) => {
        console.log(`Data available for ${socketId}, size: ${e.data.size}`);
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        individualChunksRef.current.set(socketId, blob);
        console.log(
          `Recording stopped for ${socketId}, blob size: ${blob.size}`
        );
        console.log(`Chunks length for ${socketId}: ${chunks.length}`);
      };

      recorder.onerror = (e) => {
        console.error(`Recording error for ${socketId}:`, e);
      };

      recorder.onstart = () => {
        console.log(`Recording started for ${socketId}`);
      };

      recorder.start(1000);
      individualRecordersRef.current.set(socketId, recorder);
      console.log(
        `MediaRecorder started for ${socketId}, state: ${recorder.state}`
      );
    } catch (error) {
      console.error(`Error starting recorder for ${socketId}:`, error);
    }
  };

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const initializeMeeting = async () => {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        localMicRef.current = mic;

        const monitorHostAudio = () => {
          if (mic) {
            try {
              const audioContext = new AudioContext();
              const analyser = audioContext.createAnalyser();
              const source = audioContext.createMediaStreamSource(mic);
              source.connect(analyser);

              const dataArray = new Uint8Array(analyser.frequencyBinCount);
              analyser.getByteFrequencyData(dataArray);

              const average =
                dataArray.reduce((a, b) => a + b) / dataArray.length;
              console.log("Host Audio level:", average);

              if (average > 5) {
                console.log("🎤 HOST IS SPEAKING! Audio detected.");
              }

              audioContext.close();
            } catch (error) {
              console.log("Host audio level check error:", error);
            }
          }
        };

        const hostAudioInterval = setInterval(monitorHostAudio, 2000);
        audioIntervalsRef.current.set("host", hostAudioInterval);

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
            pc = new RTCPeerConnection({
              iceServers: ICE,
              sdpSemantics: "unified-plan",
            });

            const remoteStream = new MediaStream();

            pc.ontrack = (e) => {
              if (e.streams && e.streams[0]) {
                console.log("Received remote track from:", from);
                console.log("Track details:", e.track);
                console.log(
                  "Track enabled:",
                  e.track.enabled,
                  "muted:",
                  e.track.muted
                );

                e.streams[0].getTracks().forEach((track) => {
                  console.log(`Adding track ${track.id} to remote stream`);
                  remoteStream.addTrack(track);

                  track.onmute = () =>
                    console.log(`Track ${track.id} was muted!`);
                  track.onunmute = () =>
                    console.log(`Track ${track.id} was unmuted!`);
                  track.onended = () => console.log(`Track ${track.id} ended`);
                });

                const monitorGuestAudio = () => {
                  try {
                    const audioContext = new AudioContext();
                    const analyser = audioContext.createAnalyser();
                    const source =
                      audioContext.createMediaStreamSource(remoteStream);
                    source.connect(analyser);

                    const dataArray = new Uint8Array(
                      analyser.frequencyBinCount
                    );
                    analyser.getByteFrequencyData(dataArray);

                    const average =
                      dataArray.reduce((a, b) => a + b) / dataArray.length;
                    console.log(`Audio level from guest ${from}:`, average);

                    if (average > 5) {
                      console.log(
                        `🎤 GUEST ${from} IS SPEAKING! Audio received.`
                      );
                    }

                    audioContext.close();
                  } catch (error) {
                    console.log("Guest audio level check error:", error);
                  }
                };

                const guestAudioInterval = setInterval(monitorGuestAudio, 2000);
                audioIntervalsRef.current.set(from, guestAudioInterval);

                addRemoteRef.current(remoteStream, from);
                startIndividualRecording(from, remoteStream.clone());
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

            pc.onconnectionstatechange = () => {
              console.log(`Connection state for ${from}:`, pc.connectionState);
            };

            pc.oniceconnectionstatechange = () => {
              console.log(
                `ICE connection state for ${from}:`,
                pc.iceConnectionState
              );
            };
          }

          if (data.sdp) {
            console.log(`Received SDP from ${from}`);
            await pc.setRemoteDescription(data.sdp);

            const answer = await pc.createAnswer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: false,
            });

            await pc.setLocalDescription(answer);

            sock.emit("signal", {
              to: from,
              data: { sdp: pc.localDescription },
            });
          } else if (data.candidate) {
            console.log(`Received ICE candidate from ${from}`);
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

      audioIntervalsRef.current.forEach((interval, socketId) => {
        clearInterval(interval);
        console.log(`Cleared audio monitoring for ${socketId}`);
      });
      audioIntervalsRef.current.clear();
    };
  }, [roomId, nav]);

  const startRec = () => {
    if (!mediaRecorderRef.current) return;
    recordedChunksRef.current = [];
    individualRecordersRef.current.clear();
    individualChunksRef.current.clear();

    mediaRecorderRef.current.start(1000);
    setRecording(true);
    setShowPreview(false);

    if (localMicRef.current) {
      startIndividualRecording("host", localMicRef.current);
    }

    peersRef.current.forEach((pc, socketId) => {
      const remoteStream = new MediaStream();
      pc.getReceivers().forEach((receiver) => {
        if (receiver.track) {
          remoteStream.addTrack(receiver.track);
        }
      });

      if (remoteStream.getAudioTracks().length > 0) {
        startIndividualRecording(socketId, remoteStream);
      }
    });
  };

  const stopRec = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setRecording(false);

      individualRecordersRef.current.forEach((recorder, socketId) => {
        if (recorder.state === "recording") {
          recorder.stop();
          console.log(`Stopped recorder for ${socketId}`);
        }
      });
    }
  };

  const uploadRecording = async () => {
    if (!recordingBlobRef.current) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("mixed", recordingBlobRef.current, "mixed.webm");
      const res = await api.post(`/meetings/${roomId}/recording`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setTranscript(res.data.transcript || "");
      setShowEndButton(true);
      alert("Recording uploaded successfully.");
    } catch (err) {
      console.error("Error uploading recordings:", err);
      alert("Error uploading recording.");
    } finally {
      setUploading(false);
    }
  };

  const endMeeting = async () => {
    try {
      await api.post(`/meetings/${roomId}/end`);
      alert("Meeting ended successfully.");
      nav("/dashboard");
    } catch (err) {
      console.error("Error ending meeting:", err);
      alert("Error ending meeting.");
    }
  };

  const toggleMute = () => {
    if (localMicRef.current) {
      const audioTracks = localMicRef.current.getAudioTracks();
      console.log("Toggling mute, current state:", isMuted);

      audioTracks.forEach((track) => {
        console.log(`Track ${track.id} enabled before:`, track.enabled);
        track.enabled = !isMuted;
        console.log(`Track ${track.id} enabled after:`, track.enabled);
      });
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

            {transcript && (
              <div className="mt-4 p-3 border rounded bg-gray-100">
                <h3 className="font-bold mb-2">Transcript:</h3>
                <p>{transcript}</p>
              </div>
            )}

            {showEndButton && (
              <button
                onClick={endMeeting}
                className="mt-4 bg-red-500 text-white px-4 py-2 rounded"
              >
                End Meeting
              </button>
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
