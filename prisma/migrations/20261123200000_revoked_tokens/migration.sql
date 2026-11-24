CREATE TABLE "RevokedToken" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevokedToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RevokedToken_expiresAt_idx" ON "RevokedToken"("expiresAt");
