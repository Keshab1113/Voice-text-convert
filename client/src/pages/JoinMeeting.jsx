import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { API_BASE } from '../api';

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];

export default function JoinMeeting() {
  const { roomId } = useParams();
  const nav = useNavigate();
  const [status, setStatus] = useState('Requesting to join…');
  const socketRef = useRef(null);
  const pcRef = useRef(null);

  useEffect(() => {
    const run = async () => {
      const sock = io(API_BASE, { transports: ['websocket'] });
      socketRef.current = sock;
      let deviceLabel = navigator.userAgent;
      try {
        const streamTmp = await navigator.mediaDevices.getUserMedia({ audio:true });
        const track = streamTmp.getAudioTracks()[0];
        deviceLabel = track.label || deviceLabel;
        streamTmp.getTracks().forEach(t=>t.stop());
      } catch(error) {
        console.log("Error from JoinMeeting.jsx: ",error);
      }
      sock.emit('guest:request-join', { roomId, name: 'Guest', deviceLabel });
      sock.on('guest:approved', async () => {
        setStatus('Approved. Connecting…');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const pc = new RTCPeerConnection({ iceServers: ICE });
        pcRef.current = pc;
        for (const track of stream.getTracks()) pc.addTrack(track, stream);
        pc.onicecandidate = (ev) => {
          if (ev.candidate) sock.emit('signal', { to: findHost(sock), data: { candidate: ev.candidate } });
        };
        const offer = await pc.createOffer({ offerToReceiveAudio: false });
        await pc.setLocalDescription(offer);
        sock.emit('signal', { to: findHost(sock), data: { sdp: pc.localDescription } });
      });

      sock.on('guest:denied', ({ reason }) => {
        alert(reason || 'Denied');
        nav('/'); 
      });

      sock.on('signal', async ({ data }) => {
        if (data.sdp) {
          await pcRef.current.setRemoteDescription(data.sdp);
        } else if (data.candidate) {
          try { await pcRef.current.addIceCandidate(data.candidate); } catch {}
        }
      });

      sock.on('room:ended', () => {
        alert('Meeting ended by host.');
        nav('/');
      });
    };
    run();

    return () => { try { socketRef.current?.disconnect(); } catch {} };
  }, [roomId]);

  // In this minimal demo we broadcast to the room and the server targets correct peer.
  function findHost(sock) {
    // Placeholder: server routes by 'to' socket id from incoming message; guests don't know host id.
    // We still send; server overrides 'to' using 'from' in its handler. This value is ignored.
    return 'host';
  }

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded shadow">
      <h1 className="text-lg font-semibold mb-2">Join Room</h1>
      <div className="text-gray-600">{status}</div>
    </div>
  );
}
