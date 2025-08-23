import React from 'react';

export default function JoinRequestModal({ reqs, onApprove, onReject }) {
  if (!reqs.length) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded p-4 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-3">Join Requests</h3>
        <ul className="space-y-3">
          {reqs.map(r => (
            <li key={r.socketId} className="border p-2 rounded">
              <div className="font-medium">{r.name || 'Guest'}</div>
              <div className="text-xs text-gray-500">{r.deviceLabel || 'Unknown device'}</div>
              <div className="mt-2 flex gap-2">
                <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={()=>onApprove(r.socketId)}>Admit</button>
                <button className="px-3 py-1 bg-red-600 text-white rounded" onClick={()=>onReject(r.socketId)}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
