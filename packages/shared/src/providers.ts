import type { VerificationResult } from './enums.js';

export interface ModerationLabel {
  name: string;
  score: number;
}

export interface ModerationProvider {
  scanImage(buf: Buffer): Promise<{ labels: ModerationLabel[]; flagged: boolean }>;
  transcribeAndScore(
    audio: Buffer,
    locale?: string,
  ): Promise<{ text: string; toxicity: number; labels: string[] }>;
  scoreText(text: string): Promise<{ toxicity: number; labels: string[] }>;
}

export interface AgeVerificationProvider {
  verifyFromEstimate(input: {
    estimatedAge: number;
    confidence: number;
    liveness: boolean;
  }): Promise<VerificationResult>;
  startDocumentCheck(userId: string): Promise<{ redirectUrl: string }>;
}

export interface SmsProvider {
  sendOtp(phoneE164: string, code: string): Promise<void>;
}

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
}

export interface StorageProvider {
  putObject(key: string, data: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  signedUrl(key: string, expiresSec: number): Promise<string>;
}

export interface LiveKitProvider {
  createRoom(roomName: string): Promise<void>;
  deleteRoom(roomName: string): Promise<void>;
  createToken(input: {
    roomName: string;
    identity: string;
    name: string;
    ttlSec?: number;
  }): Promise<{ url: string; token: string }>;
}

export interface CaptionLine {
  speakerLocale: string;
  text: string;
  original: string;
  translatedTo: string | null;
  provider: string;
  partial?: boolean;
}

export interface SttProvider {
  /** Transcribe an audio chunk (webm/wav/ogg). Empty audio → local streaming fallback. */
  transcribe(audio: Buffer, locale?: string): Promise<{ text: string; locale: string; provider: string }>;
  /** Dev/local stream of progressive caption lines when no audio vendor is configured. */
  nextStreamingLine?(tick: number): CaptionLine;
}

export interface TranslationProvider {
  translate(text: string, from: string, to: string): Promise<string>;
}
