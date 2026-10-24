/**
 * Live captions + translation hooks (Phase 7).
 * Mock provider returns canned lines; swap for real STT + MT later.
 */
export class CaptionsService {
  private lines = [
    { locale: 'en', text: 'That jazz bar was unforgettable.' },
    { locale: 'ja', text: 'そのジャズバーは忘れられない。', translated: 'That jazz bar was unforgettable.' },
    { locale: 'en', text: 'Shall we try another icebreaker?' },
    { locale: 'hi', text: 'क्या हम फिर मिलें?', translated: 'Shall we meet again?' },
  ];

  nextLine(tick: number, translateTo?: string | null) {
    const line = this.lines[tick % this.lines.length]!;
    if (translateTo && translateTo !== line.locale && line.translated) {
      return {
        speakerLocale: line.locale,
        text: line.translated,
        original: line.text,
        translatedTo: translateTo,
        provider: 'mock-stt+mt',
      };
    }
    return {
      speakerLocale: line.locale,
      text: line.text,
      original: line.text,
      translatedTo: null as string | null,
      provider: 'mock-stt',
    };
  }
}
