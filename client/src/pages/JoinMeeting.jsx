import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import io from "socket.io-client";
import { API_BASE } from "../api";
import { FaMicrophone, FaMicrophoneSlash, FaSpinner, FaCheckCircle, FaTimesCircle } from "react-icons/fa";

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];

export default function JoinMeeting() {
  const { roomId } = useParams();
  const nav = useNavigate();
  const [status, setStatus] = useState("Requesting to join…");
  const [statusType, setStatusType] = useState("info"); // info, success, error, loading
  const [isMuted, setIsMuted] = useState(false);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const hostSocketIdRef = useRef(null);

  useEffect(() => {
    const run = async () => {
      setStatus("Connecting to server…");
      setStatusType("loading");
      
      const sock = io(API_BASE, { transports: ["websocket"] });
      socketRef.current = sock;

      let deviceLabel = navigator.userAgent;
      try {
        const streamTmp = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const track = streamTmp.getAudioTracks()[0];
        deviceLabel = track.label || deviceLabel;
        streamTmp.getTracks().forEach((t) => t.stop());
      } catch (error) {
        console.log("Error getting device info: ", error);
      }

      setStatus("Requesting to join room…");
      sock.emit("guest:request-join", { roomId, name: "Guest", deviceLabel });

      // Listen for host socket ID from server
      sock.on("host:socket-id", ({ hostId }) => {
        console.log("Received host socket ID:", hostId);
        hostSocketIdRef.current = hostId;
        setStatus("Waiting for host approval…");
        setStatusType("info");
      });

      sock.on("guest:approved", async () => {
        setStatus("Approved. Connecting audio…");
        setStatusType("success");
        
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          localStreamRef.current = stream;
          
          console.log("Guest audio tracks:", stream.getAudioTracks());
          const pc = new RTCPeerConnection({ iceServers: ICE });
          pcRef.current = pc;
          
          for (const track of stream.getTracks()) {
            console.log("Adding track:", track.kind, track.id);
            pc.addTrack(track, stream);
          }

          // Handle incoming audio
          pc.ontrack = (event) => {
            console.log("Guest received track:", event.streams[0]);
          };

          pc.onicecandidate = (ev) => {
            if (ev.candidate && hostSocketIdRef.current) {
              sock.emit("signal", {
                to: hostSocketIdRef.current,
                data: { candidate: ev.candidate },
              });
            }
          };

          const offer = await pc.createOffer({
            offerToReceiveAudio: false,
            offerToReceiveVideo: false,
          });
          await pc.setLocalDescription(offer);

          if (hostSocketIdRef.current) {
            sock.emit("signal", {
              to: hostSocketIdRef.current,
              data: { sdp: pc.localDescription },
            });
          }
          
          setStatus("Connected to meeting");
          setStatusType("success");
        } catch (error) {
          console.error("Error setting up audio:", error);
          setStatus("Error setting up audio. Please check microphone permissions.");
          setStatusType("error");
        }
      });

      sock.on("guest:denied", ({ reason }) => {
        setStatus(`Request denied: ${reason || "No reason provided"}`);
        setStatusType("error");
        setTimeout(() => {
          alert(reason || "Denied");
          nav("/");
        }, 2000);
      });

      sock.on("signal", async ({ data }) => {
        if (!pcRef.current) return;

        try {
          if (data.sdp) {
            console.log("Received SDP from host");
            await pcRef.current.setRemoteDescription(data.sdp);
          } else if (data.candidate) {
            console.log("Received ICE candidate from host");
            await pcRef.current.addIceCandidate(data.candidate);
          }
        } catch (error) {
          console.log("Error processing signal:", error);
        }
      });

      sock.on("room:ended", () => {
        setStatus("Meeting ended by host.");
        setStatusType("info");
        setTimeout(() => {
          alert("Meeting ended by host.");
          nav("/");
        }, 2000);
      });

      sock.on("connect_error", (error) => {
        console.error("Socket connection error:", error);
        setStatus("Connection failed. Please try again.");
        setStatusType("error");
      });

      sock.on("connect", () => {
        setStatus("Connected to server");
        setStatusType("success");
      });
    };

    run();

    return () => {
      try {
        if (pcRef.current) {
          pcRef.current.close();
        }
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop());
        }
        socketRef.current?.disconnect();
      } catch (error) {
        console.log("Error in cleanup:", error);
      }
    };
  }, [roomId, nav]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const getStatusIcon = () => {
    switch (statusType) {
      case "loading":
        return <FaSpinner className="animate-spin" />;
      case "success":
        return <FaCheckCircle />;
      case "error":
        return <FaTimesCircle />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (statusType) {
      case "loading":
        return "text-blue-600";
      case "success":
        return "text-green-600";
      case "error":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="bg-indigo-600 p-4 text-white">
          <h1 className="text-xl font-semibold">Joining Meeting</h1>
          <p className="text-sm opacity-90">Room ID: {roomId}</p>
        </div>
        
        <div className="p-6">
          <div className="flex items-center justify-center mb-6">
            <div className={`text-4xl mr-3 ${getStatusColor()}`}>
              {getStatusIcon()}
            </div>
            <div>
              <p className={`font-medium ${getStatusColor()}`}>{status}</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Microphone</span>
              <button
                onClick={toggleMute}
                className={`flex items-center gap-2 px-4 py-2 rounded-full ${
                  isMuted 
                    ? "bg-red-100 text-red-700 hover:bg-red-200" 
                    : "bg-green-100 text-green-700 hover:bg-green-200"
                } transition-colors`}
              >
                {isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
                {isMuted ? "Unmute" : "Mute"}
              </button>
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={() => nav("/")}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Leave Meeting
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}