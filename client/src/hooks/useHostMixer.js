export async function createHostMixerStream(localMic) {
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  if (localMic) {
    const src = audioCtx.createMediaStreamSource(localMic);
    src.connect(dest);
  }

  const addRemote = (remoteStream) => {
    const s = audioCtx.createMediaStreamSource(remoteStream);
    s.connect(dest);
  };

  return { mixedStream: dest.stream, addRemote };
}
