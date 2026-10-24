import type {
  AgeVerificationProvider,
  LiveKitProvider,
  ModerationProvider,
  SmsProvider,
  StorageProvider,
} from '@talkdrop/shared';
import type { AppConfig } from '../config.js';
import { createAgeProvider } from './age.js';
import { createLiveKitProvider } from './livekit.js';
import { createModerationProvider } from './moderation.js';
import { createSmsProvider } from './sms.js';
import { createStorageProvider } from './storage.js';

export interface Providers {
  sms: SmsProvider;
  age: AgeVerificationProvider;
  moderation: ModerationProvider;
  storage: StorageProvider;
  livekit: LiveKitProvider;
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
  };
}
