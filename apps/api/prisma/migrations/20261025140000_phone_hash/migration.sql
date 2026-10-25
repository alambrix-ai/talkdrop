-- Phone at-rest: lookup hash + encrypted E.164 (application encrypts phone_e164)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_hash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_hash_key" ON "users"("phone_hash");

-- OTP rows keyed by phone hash (plaintext phone no longer stored on OTP)
ALTER TABLE "auth_otps" ADD COLUMN IF NOT EXISTS "phone_hash" TEXT;
CREATE INDEX IF NOT EXISTS "auth_otps_phone_hash_idx" ON "auth_otps"("phone_hash");
