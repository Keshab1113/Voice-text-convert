import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { API_BASE } from '../api';

export default function QRCodeBox({ roomId }) {
  const joinUrl = `${window.location.origin}/join/${roomId}`;
  return (
    <div className="p-4 bg-white rounded shadow inline-flex flex-col items-center">
      <QRCodeCanvas value={joinUrl} size={160} />
      <div className="mt-2 text-sm break-all">{joinUrl}</div>
    </div>
  );
}
