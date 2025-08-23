export async function createHostMixerStream(localMic) {
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  
  if (localMic) {
    const src = audioCtx.createMediaStreamSource(localMic);
    src.connect(dest);
  }

  const addRemote = (remoteStream) => {
    console.log("Adding remote stream to mixer:", remoteStream.id);
    
    // Check if the remote stream has audio tracks
    const audioTracks = remoteStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn("Remote stream has no audio tracks");
      return;
    }

    try {
      const remoteSource = audioCtx.createMediaStreamSource(remoteStream);
      remoteSource.connect(dest);
      console.log("Remote audio connected to mixer");
    } catch (error) {
      console.error("Error adding remote stream to mixer:", error);
    }
  };

  return { mixedStream: dest.stream, addRemote };
}