import type { CaptionLine, SttProvider, TranslationProvider } from '@talkdrop/shared';

const STREAM_LINES: CaptionLine[] = [
  {
    speakerLocale: 'en',
    text: 'That jazz bar was unforgettable.',
    original: 'That jazz bar was unforgettable.',
    translatedTo: null,
    provider: 'local-stream',
  },
  {
    speakerLocale: 'ja',
    text: 'そのジャズバーは忘れられない。',
    original: 'そのジャズバーは忘れられない。',
    translatedTo: null,
    provider: 'local-stream',
  },
  {
    speakerLocale: 'en',
    text: 'Shall we try another icebreaker?',
    original: 'Shall we try another icebreaker?',
    translatedTo: null,
    provider: 'local-stream',
  },
  {
    speakerLocale: 'hi',
    text: 'क्या हम फिर मिलें?',
    original: 'क्या हम फिर मिलें?',
    translatedTo: null,
    provider: 'local-stream',
  },
];

/** Local/dev STT: streams progressive lines; accepts audio but returns streaming fallback. */
export class LocalStreamingSttProvider implements SttProvider {
  async transcribe(
    audio: Buffer,
    locale = 'en',
  ): Promise<{ text: string; locale: string; provider: string }> {
    if (audio.length < 32) {
      const line = this.nextStreamingLine!(Date.now());
      return { text: line.text, locale: line.speakerLocale, provider: 'local-stream' };
    }
    // Without a cloud STT key we acknowledge the chunk and emit a streaming line
    // so the caption UI keeps moving during local/dev sessions.
    const line = this.nextStreamingLine!(Date.now() + audio.length);
    return { text: line.text, locale: locale || line.speakerLocale, provider: 'local-stream' };
  }

  nextStreamingLine(tick: number): CaptionLine {
    return { ...STREAM_LINES[tick % STREAM_LINES.length]! };
  }
}

/** Deepgram nova — requires DEEPGRAM_API_KEY. */
export class DeepgramSttProvider implements SttProvider {
  constructor(private apiKey: string) {}

  async transcribe(
    audio: Buffer,
    locale = 'en',
  ): Promise<{ text: string; locale: string; provider: string }> {
    if (audio.length < 32) {
      return { text: '', locale, provider: 'deepgram' };
    }
    const res = await fetch(
      `https://api.deepgram.com/v1/listen?model=nova-2&language=${encodeURIComponent(locale)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.apiKey}`,
          'Content-Type': 'audio/webm',
        },
        body: new Uint8Array(audio),
      },
    );
    if (!res.ok) {
      throw new Error(`Deepgram STT failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as {
      results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
    };
    const text =
      json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? '';
    return { text, locale, provider: 'deepgram' };
  }
}

/** OpenAI Whisper-compatible — requires OPENAI_API_KEY. */
export class WhisperSttProvider implements SttProvider {
  constructor(
    private apiKey: string,
    private baseUrl = 'https://api.openai.com/v1',
  ) {}

  async transcribe(
    audio: Buffer,
    locale = 'en',
  ): Promise<{ text: string; locale: string; provider: string }> {
    if (audio.length < 32) {
      return { text: '', locale, provider: 'whisper' };
    }
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/webm' }), 'chunk.webm');
    form.append('model', process.env.WHISPER_MODEL ?? 'whisper-1');
    if (locale) form.append('language', locale.slice(0, 2));

    const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`Whisper STT failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as { text?: string };
    return { text: (json.text ?? '').trim(), locale, provider: 'whisper' };
  }
}

export class IdentityTranslationProvider implements TranslationProvider {
  async translate(text: string, _from: string, _to: string): Promise<string> {
    return text;
  }
}

/** LibreTranslate-compatible HTTP — set LIBRETRANSLATE_URL (e.g. http://localhost:5000). */
export class LibreTranslateProvider implements TranslationProvider {
  constructor(
    private baseUrl: string,
    private apiKey?: string,
  ) {}

  async translate(text: string, from: string, to: string): Promise<string> {
    if (!text.trim() || from === to) return text;
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: from.slice(0, 2),
        target: to.slice(0, 2),
        format: 'text',
        api_key: this.apiKey || undefined,
      }),
    });
    if (!res.ok) {
      throw new Error(`LibreTranslate failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as { translatedText?: string };
    return json.translatedText ?? text;
  }
}

/** MyMemory free MT fallback (rate-limited; fine for local/dev). */
export class MyMemoryTranslationProvider implements TranslationProvider {
  async translate(text: string, from: string, to: string): Promise<string> {
    if (!text.trim() || from === to) return text;
    const langpair = `${from.slice(0, 2)}|${to.slice(0, 2)}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`;
    const res = await fetch(url);
    if (!res.ok) return text;
    const json = (await res.json()) as { responseData?: { translatedText?: string } };
    return json.responseData?.translatedText ?? text;
  }
}

export function createSttProvider(kind: string): SttProvider {
  const provider = (kind || 'local').toLowerCase();
  if (provider === 'deepgram') {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new Error('STT_PROVIDER=deepgram requires DEEPGRAM_API_KEY');
    console.info('[stt] using DeepgramSttProvider');
    return new DeepgramSttProvider(key);
  }
  if (provider === 'whisper' || provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('STT_PROVIDER=whisper requires OPENAI_API_KEY');
    console.info('[stt] using WhisperSttProvider');
    return new WhisperSttProvider(key, process.env.OPENAI_BASE_URL);
  }
  console.info('[stt] using LocalStreamingSttProvider');
  return new LocalStreamingSttProvider();
}

export function createTranslationProvider(kind: string): TranslationProvider {
  const provider = (kind || 'local').toLowerCase();
  if (provider === 'libretranslate') {
    const url = process.env.LIBRETRANSLATE_URL;
    if (!url) throw new Error('MT_PROVIDER=libretranslate requires LIBRETRANSLATE_URL');
    console.info('[mt] using LibreTranslateProvider');
    return new LibreTranslateProvider(url, process.env.LIBRETRANSLATE_API_KEY);
  }
  if (provider === 'mymemory') {
    console.info('[mt] using MyMemoryTranslationProvider');
    return new MyMemoryTranslationProvider();
  }
  if (provider === 'identity' || provider === 'local' || provider === 'mock') {
    return new IdentityTranslationProvider();
  }
  console.warn(`[mt] Unknown MT_PROVIDER=${kind}; using identity`);
  return new IdentityTranslationProvider();
}
