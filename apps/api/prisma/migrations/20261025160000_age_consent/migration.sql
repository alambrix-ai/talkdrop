-- Age gate is self-attestation (Yes/No 18+ consent), not face/document checks.
ALTER TYPE "VerificationMethod" ADD VALUE 'self_attestation';

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "age_consent_at" TIMESTAMPTZ(6);
