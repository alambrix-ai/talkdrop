import type { ModerationProvider } from '@talkdrop/shared';

/** Same contract as apps/api mock — kept local so worker has no apps/api import. */
export class MockModerationProvider implements ModerationProvider {
  async scanImage(buf: Buffer): Promise<{ labels: { name: string; score: number }[]; flagged: boolean }> {
    const text = buf.toString('utf8', 0, Math.min(buf.length, 64));
    if (text.includes('FLAG') || text.includes('NUDITY')) {
      return { labels: [{ name: 'nudity', score: 0.95 }], flagged: true };
    }
    return { labels: [{ name: 'safe', score: 0.99 }], flagged: false };
  }

  async transcribeAndScore(
    _audio: Buffer,
    _locale?: string,
  ): Promise<{ text: string; toxicity: number; labels: string[] }> {
    return { text: '', toxicity: 0.01, labels: [] };
  }

  async scoreText(text: string): Promise<{ toxicity: number; labels: string[] }> {
    const toxic = /hate|kill|slur/i.test(text);
    return { toxicity: toxic ? 0.95 : 0.05, labels: toxic ? ['toxicity'] : [] };
  }
}
