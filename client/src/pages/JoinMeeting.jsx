import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import io from "socket.io-client";
import { API_BASE } from "../api";

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];

export default function JoinMeeting() {
  const { roomId } = useParams();
  const nav = useNavigate();
  const [status, setStatus] = useState("Requesting to join…");
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const hostSocketIdRef = useRef(null); // Add this to store host socket ID

  useEffect(() => {
    const run = async () => {
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
        console.log("Error from JoinMeeting.jsx: ", error);
      }

      sock.emit("guest:request-join", { roomId, name: "Guest", deviceLabel });

      // Listen for host socket ID from server
      sock.on("host:socket-id", ({ hostId }) => {
        console.log("Received host socket ID:", hostId);
        hostSocketIdRef.current = hostId;
      });

      sock.on("guest:approved", async () => {
        setStatus("Approved. Connecting…");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const pc = new RTCPeerConnection({ iceServers: ICE });
        pcRef.current = pc;

        // Add this to handle incoming audio (though guest shouldn't receive audio)
        pc.ontrack = (event) => {
          console.log("Guest received track:", event.streams[0]);
          // You might want to handle this if guest should hear other participants
        };

        for (const track of stream.getTracks()) pc.addTrack(track, stream);

        pc.onicecandidate = (ev) => {
          if (ev.candidate && hostSocketIdRef.current) {
            sock.emit("signal", {
              to: hostSocketIdRef.current, // Use actual host ID
              data: { candidate: ev.candidate },
            });
          }
        };

        const offer = await pc.createOffer({
          offerToReceiveAudio: false, // Guest doesn't need to receive audio
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);

        if (hostSocketIdRef.current) {
          sock.emit("signal", {
            to: hostSocketIdRef.current, // Use actual host ID
            data: { sdp: pc.localDescription },
          });
        }
      });

      sock.on("guest:denied", ({ reason }) => {
        alert(reason || "Denied");
        nav("/");
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
        alert("Meeting ended by host.");
        nav("/");
      });

      // Add error handling
      sock.on("connect_error", (error) => {
        console.error("Socket connection error:", error);
        setStatus("Connection failed. Please try again.");
      });
    };

    run();

    return () => {
      try {
        if (pcRef.current) {
          pcRef.current.close();
        }
        socketRef.current?.disconnect();
      } catch (error) {
        console.log("Error in cleanup:", error);
      }
    };
  }, [roomId, nav]);

  // Remove the findHost function since we're using the actual host ID

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded shadow">
      <h1 className="text-lg font-semibold mb-2">Join Room</h1>
      <div className="text-gray-600">{status}</div>
    </div>
  );
}
