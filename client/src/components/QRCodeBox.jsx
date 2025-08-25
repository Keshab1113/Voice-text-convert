import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { FaCopy } from 'react-icons/fa';

export default function QRCodeBox({ roomId }) {
  const joinUrl = `${window.location.origin}/join/${roomId}`;
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(joinUrl);
    // You could add a toast notification here
    alert('Copied to clipboard!');
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">Share this QR Code</h3>
      <div className="p-3 bg-white rounded border border-gray-200">
        <QRCodeCanvas value={joinUrl} size={160} />
      </div>
      <div className="mt-3 flex items-center w-full">
        <div className="text-xs text-gray-600 break-all flex-1 mr-2">
          {joinUrl}
        </div>
        <button 
          onClick={copyToClipboard}
          className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded"
          title="Copy link"
        >
          <FaCopy />
        </button>
      </div>
    </div>
  );
}