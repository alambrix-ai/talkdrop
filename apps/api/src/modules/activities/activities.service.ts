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
      // answer withheld from clients until reveal
      _answer: item.answer,
    };
  }

  scoreTrivia(roundId: string, choice: 'a' | 'b') {
    const idx = Number(roundId.split('_')[1] ?? 0) % TRIVIA.length;
    const item = TRIVIA[idx]!;
    return { correct: choice === item.answer, answer: item.answer };
  }

  /** Co-draw / co-watch stubs — shared canvas & watch party land later; keep round UX live. */
  startCoDraw(seed = Date.now()) {
    return {
      activity: 'co-draw' as const,
      prompt: 'Co-draw (stub): pick a theme — your strokes sync later.',
      options: ['Night city skyline', 'One shared doodle word'] as [string, string],
      roundId: `codraw_${seed}`,
      stub: true as const,
    };
  }

  startCoWatch(seed = Date.now()) {
    return {
      activity: 'co-watch' as const,
      prompt: 'Co-watch (stub): pick a clip to watch together.',
      options: ['30s jazz short', 'Street food reel'] as [string, string],
      roundId: `cowatch_${seed}`,
      stub: true as const,
    };
  }
}
