export const COWATCH_CATALOG = [
  {
    id: 'jazz-short',
    title: '30s jazz short',
    // Creative Commons / sample clip (Big Buck Bunny excerpt via Google CDN mirror)
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  },
  {
    id: 'street-food',
    title: 'Street food reel',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  },
  {
    id: 'city-walk',
    title: 'Night city walk',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  },
] as const;

const WYR = [
  {
    prompt: 'Would you rather…',
    options: ['Only listen to jazz forever', 'Never hear music again'] as [string, string],
  },
  {
    prompt: 'Would you rather…',
    options: ['Travel only by night walks', 'Travel only by street food tours'] as [string, string],
  },
  {
    prompt: 'Would you rather…',
    options: ['Debate strangers daily', 'Play icebreaker games forever'] as [string, string],
  },
];

const TRIVIA = [
  {
    prompt: 'Which album is often called the greatest jazz record?',
    options: ['Kind of Blue', 'Abbey Road'] as [string, string],
    answer: 'a' as const,
  },
  {
    prompt: 'Tokyo is in which country?',
    options: ['Japan', 'South Korea'] as [string, string],
    answer: 'a' as const,
  },
];

export class ActivitiesService {
  startWouldYouRather(seed = Date.now()) {
    const item = WYR[seed % WYR.length]!;
    return {
      activity: 'would-you-rather' as const,
      prompt: item.prompt,
      options: item.options,
      roundId: `wyr_${seed}`,
    };
  }

  startTrivia(seed = Date.now()) {
    const item = TRIVIA[seed % TRIVIA.length]!;
    return {
      activity: 'trivia' as const,
      prompt: item.prompt,
      options: item.options,
      roundId: `trivia_${seed}`,
      _answer: item.answer,
    };
  }

  scoreTrivia(roundId: string, choice: 'a' | 'b') {
    const idx = Number(roundId.split('_')[1] ?? 0) % TRIVIA.length;
    const item = TRIVIA[idx]!;
    return { correct: choice === item.answer, answer: item.answer };
  }

  /** Shared canvas session — strokes sync over sockets. */
  startCoDraw(seed = Date.now()) {
    return {
      activity: 'co-draw' as const,
      prompt: 'Co-draw together — strokes sync live.',
      options: ['Night city skyline', 'One shared doodle word'] as [string, string],
      roundId: `codraw_${seed}`,
      canvas: { width: 640, height: 360, theme: seed % 2 === 0 ? 'skyline' : 'word' },
      stub: false as const,
    };
  }

  /** Shared watch party — catalog + player state sync over sockets. */
  startCoWatch(seed = Date.now()) {
    const clip = COWATCH_CATALOG[seed % COWATCH_CATALOG.length]!;
    return {
      activity: 'co-watch' as const,
      prompt: 'Co-watch — pick a clip; play/pause/seek stay in sync.',
      options: [COWATCH_CATALOG[0]!.title, COWATCH_CATALOG[1]!.title] as [string, string],
      roundId: `cowatch_${seed}`,
      catalog: COWATCH_CATALOG.map((c) => ({ id: c.id, title: c.title, url: c.url })),
      state: {
        videoId: clip.id,
        url: clip.url,
        playing: false,
        positionSec: 0,
      },
      stub: false as const,
    };
  }

  resolveCoWatchVideo(videoId: string) {
    return COWATCH_CATALOG.find((c) => c.id === videoId) ?? COWATCH_CATALOG[0]!;
  }
}
