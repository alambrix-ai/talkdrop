import type {
  AgeVerificationProvider,
  LiveKitProvider,
  ModerationProvider,
  SmsProvider,
  StorageProvider,
  SttProvider,
  TranslationProvider,
} from '@talkdrop/shared';
import type { AppConfig } from '../config.js';
import { createAgeProvider } from './age.js';
import { createLiveKitProvider } from './livekit.js';
import { createModerationProvider } from './moderation.js';
import { createSmsProvider } from './sms.js';
import { createStorageProvider } from './storage.js';
import { createSttProvider, createTranslationProvider } from './captions.js';

export interface Providers {
  sms: SmsProvider;
  age: AgeVerificationProvider;
  moderation: ModerationProvider;
  storage: StorageProvider;
  livekit: LiveKitProvider;
  stt: SttProvider;
  mt: TranslationProvider;
}

export async function createProviders(config: AppConfig): Promise<Providers> {
  return {
    sms: createSmsProvider(config.SMS_PROVIDER),
    age: createAgeProvider(config.AGE_PROVIDER),
    moderation: createModerationProvider(config.MODERATION_PROVIDER),
    storage: createStorageProvider(config.S3_MOCK),
    livekit: await createLiveKitProvider({
      mock: config.LIVEKIT_MOCK,
      url: config.LIVEKIT_URL,
      apiKey: config.LIVEKIT_API_KEY,
      apiSecret: config.LIVEKIT_API_SECRET,
    }),
    stt: createSttProvider(config.STT_PROVIDER),
    mt: createTranslationProvider(config.MT_PROVIDER),
  };
}
