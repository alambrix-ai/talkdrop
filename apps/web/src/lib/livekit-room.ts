import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type LocalParticipant,
} from 'livekit-client';

export interface LiveKitHandles {
  room: Room;
  attachRemote: (el: HTMLVideoElement) => void;
  attachLocal: (el: HTMLVideoElement) => void;
  setMicEnabled: (on: boolean) => Promise<void>;
  setCamEnabled: (on: boolean) => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Connect to a LiveKit room. When VITE_LIVEKIT_MOCK=true, returns null so the
 * call UI keeps using local MediaStream placeholders.
 */
export async function connectLiveKitRoom(opts: {
  url: string;
  token: string;
}): Promise<LiveKitHandles | null> {
  if (import.meta.env.VITE_LIVEKIT_MOCK === 'true') {
    return null;
  }

  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
  });

  await room.connect(opts.url, opts.token);
  await room.localParticipant.setCameraEnabled(true);
  await room.localParticipant.setMicrophoneEnabled(true);

  let remoteEl: HTMLVideoElement | null = null;
  let localEl: HTMLVideoElement | null = null;
  const attachedAudio = new Set<string>();

  const attachRemoteTrack = (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Video && remoteEl) {
      track.attach(remoteEl);
      return;
    }
    if (track.kind === Track.Kind.Audio) {
      // Audio needs an element; attach() creates/returns one when no el is passed.
      const sid = track.sid ?? track.mediaStreamTrack?.id;
      if (!sid || attachedAudio.has(sid)) return;
      track.attach();
      attachedAudio.add(sid);
    }
  };

  const bindRemote = (
    track: RemoteTrack,
    _publication: RemoteTrackPublication,
    _participant: RemoteParticipant,
  ) => {
    attachRemoteTrack(track);
  };

  room.on(RoomEvent.TrackSubscribed, bindRemote);

  const attachExisting = () => {
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        if (pub.track) attachRemoteTrack(pub.track);
      }
    }
    if (localEl) {
      const lp: LocalParticipant = room.localParticipant;
      for (const pub of lp.trackPublications.values()) {
        if (pub.track && pub.kind === Track.Kind.Video) {
          pub.track.attach(localEl);
        }
      }
    }
  };

  return {
    room,
    attachRemote(el) {
      remoteEl = el;
      attachExisting();
    },
    attachLocal(el) {
      localEl = el;
      attachExisting();
    },
    async setMicEnabled(on) {
      await room.localParticipant.setMicrophoneEnabled(on);
    },
    async setCamEnabled(on) {
      await room.localParticipant.setCameraEnabled(on);
    },
    async disconnect() {
      room.off(RoomEvent.TrackSubscribed, bindRemote);
      await room.disconnect();
    },
  };
}
