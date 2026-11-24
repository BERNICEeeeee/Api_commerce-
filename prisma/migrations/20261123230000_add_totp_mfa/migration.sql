ALTER TABLE "User"
ADD COLUMN "totpSecret" TEXT,
ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TotpBackupCode" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TotpBackupCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TotpBackupCode_codeHash_key" ON "TotpBackupCode"("codeHash");
CREATE INDEX "TotpBackupCode_userId_idx" ON "TotpBackupCode"("userId");

ALTER TABLE "TotpBackupCode"
ADD CONSTRAINT "TotpBackupCode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
