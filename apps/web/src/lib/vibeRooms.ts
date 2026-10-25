/** Presentation helpers for lobby / landing vibe rooms (energy framing, not a TV guide). */

export type RoomEnergy = 'Open now' | 'Filling up' | 'Warming up' | 'Always on';

export interface RoomLike {
  id?: string;
  title: string | null;
  startsAt?: string | null;
  joinedCount: number;
  language?: string | null;
  open?: boolean;
}

export interface VibeRoomView {
  title: string;
  blurb: string;
  vibe: string;
  energy: RoomEnergy;
  people: number;
}

const CATALOG: Array<{
  match: RegExp;
  title: string;
  blurb: string;
  vibe: string;
}> = [
  {
    match: /spanish|espa[nñ]ol/i,
    title: 'Español soft start',
    blurb: 'Warm-up chats, soft music, zero awkward silence.',
    vibe: 'Language',
  },
  {
    match: /pitch|startup/i,
    title: 'Wild pitch roulette',
    blurb: 'Two-minute wild ideas. Clap, remix, next.',
    vibe: 'Play',
  },
  {
    match: /lo-?fi|listening/i,
    title: 'Lo-fi couch',
    blurb: 'Beats on, cameras optional. Chat when the mood hits.',
    vibe: 'Listen',
  },
];

/** Static preview cards for the public landing (no API). */
export const LANDING_VIBE_ROOMS: VibeRoomView[] = [
  {
    title: 'Español soft start',
    blurb: 'Warm-up chats, soft music, zero awkward silence.',
    vibe: 'Language',
    energy: 'Open now',
    people: 126,
  },
  {
    title: 'Wild pitch roulette',
    blurb: 'Two-minute wild ideas. Clap, remix, next.',
    vibe: 'Play',
    energy: 'Filling up',
    people: 84,
  },
  {
    title: 'Lo-fi couch',
    blurb: 'Beats on, cameras optional. Chat when the mood hits.',
    vibe: 'Listen',
    energy: 'Always on',
    people: 312,
  },
];

function energyFor(room: RoomLike): RoomEnergy {
  const open = room.open ?? (!room.startsAt || new Date(room.startsAt) <= new Date());
  if (!room.startsAt) {
    return room.joinedCount >= 200 ? 'Always on' : room.joinedCount >= 60 ? 'Open now' : 'Always on';
  }
  if (!open) return 'Warming up';
  if (room.joinedCount >= 200) return 'Filling up';
  if (room.joinedCount >= 60) return 'Open now';
  return 'Warming up';
}

export function presentVibeRoom(room: RoomLike): VibeRoomView {
  const raw = room.title?.trim() || 'Vibe room';
  const hit = CATALOG.find((c) => c.match.test(raw));
  return {
    title: hit?.title ?? raw,
    blurb: hit?.blurb ?? 'Drop in for a shared vibe — icebreakers on, pressure off.',
    vibe: hit?.vibe ?? (room.language ? room.language.toUpperCase() : 'Hangout'),
    energy: energyFor(room),
    people: room.joinedCount,
  };
}
