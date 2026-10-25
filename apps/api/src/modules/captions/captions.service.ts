import type { CaptionLine, SttProvider, TranslationProvider } from '@talkdrop/shared';

/**
 * Live captions + translation (Phase 7 / production adapters).
 * STT: Deepgram / Whisper when keyed; otherwise local streaming fallback.
 * MT: LibreTranslate / MyMemory / identity behind MT_PROVIDER.
 */
export class CaptionsService {
  constructor(
    private stt: SttProvider,
    private mt: TranslationProvider,
  ) {}

  nextLine(tick: number, translateTo?: string | null): CaptionLine {
    const base =
      this.stt.nextStreamingLine?.(tick) ??
      ({
        speakerLocale: 'en',
        text: '…',
        original: '…',
        translatedTo: null,
        provider: 'local-stream',
      } satisfies CaptionLine);

    return this.applyTranslation(base, translateTo);
  }

  async fromAudio(
    audio: Buffer,
    locale: string | undefined,
    translateTo?: string | null,
  ): Promise<CaptionLine> {
    const result = await this.stt.transcribe(audio, locale);
    const line: CaptionLine = {
      speakerLocale: result.locale,
      text: result.text || '…',
      original: result.text || '…',
      translatedTo: null,
      provider: result.provider,
    };
    return this.applyTranslation(line, translateTo);
  }

  async fromClientText(
    text: string,
    speakerLocale: string,
    translateTo?: string | null,
  ): Promise<CaptionLine> {
    const line: CaptionLine = {
      speakerLocale,
      text,
      original: text,
      translatedTo: null,
      provider: 'client-stt',
    };
    return this.applyTranslation(line, translateTo);
  }

  private applyTranslation(line: CaptionLine, translateTo?: string | null): CaptionLine {
    if (!translateTo || translateTo === line.speakerLocale || !line.text) {
      return line;
    }
    // Sync path for streaming lines uses canned EN when available; async path preferred.
    return {
      ...line,
      // Caller should prefer translateAsync for real MT.
      text: line.text,
      translatedTo: null,
    };
  }

  async translateAsync(line: CaptionLine, translateTo?: string | null): Promise<CaptionLine> {
    if (!translateTo || translateTo === line.speakerLocale || !line.original) {
      return { ...line, translatedTo: null };
    }
    try {
      const translated = await this.mt.translate(
        line.original,
        line.speakerLocale,
        translateTo,
      );
      return {
        ...line,
        text: translated,
        translatedTo: translateTo,
      };
    } catch {
      return { ...line, translatedTo: null };
    }
  }
}
