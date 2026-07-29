ALTER TABLE "Client"
  ADD COLUMN "mpWebhookSecret" TEXT,
  ADD COLUMN "mpTokenValid" BOOLEAN,
  ADD COLUMN "mpTokenCheckedAt" TIMESTAMP(3);

ALTER TABLE "Esp32"
  ALTER COLUMN "credits" TYPE DECIMAL(12,2) USING ROUND("credits"::numeric, 2);

ALTER TABLE "Payment"
  ALTER COLUMN "amount" TYPE DECIMAL(12,2) USING ROUND("amount"::numeric, 2);

ALTER TABLE "Device" DROP CONSTRAINT IF EXISTS "Device_clientId_fkey";
ALTER TABLE "Device"
  ADD CONSTRAINT "Device_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_clientId_fkey";
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_esp32Id_fkey";
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_esp32Id_fkey"
  FOREIGN KEY ("esp32Id") REFERENCES "Esp32"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Device_clientId_idx" ON "Device"("clientId");
CREATE INDEX "Machine_clientId_idx" ON "Machine"("clientId");
CREATE INDEX "Esp32_machineId_idx" ON "Esp32"("machineId");
CREATE INDEX "Esp32_mpPosId_idx" ON "Esp32"("mpPosId");
CREATE INDEX "Esp32_lastSeen_idx" ON "Esp32"("lastSeen");
CREATE INDEX "Payment_clientId_createdAt_idx" ON "Payment"("clientId", "createdAt");
CREATE INDEX "Payment_clientId_status_createdAt_idx" ON "Payment"("clientId", "status", "createdAt");
CREATE INDEX "Payment_esp32Id_createdAt_idx" ON "Payment"("esp32Id", "createdAt");
CREATE INDEX "TelemetryEvent_esp32Id_createdAt_idx" ON "TelemetryEvent"("esp32Id", "createdAt");
CREATE INDEX "TelemetryEvent_createdAt_idx" ON "TelemetryEvent"("createdAt");

CREATE TABLE "OutboxMessage" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "esp32Id" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboxMessage_paymentId_key" ON "OutboxMessage"("paymentId");
CREATE INDEX "OutboxMessage_status_nextAttempt_idx" ON "OutboxMessage"("status", "nextAttempt");


CREATE TABLE "WebhookIssue" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "posId" TEXT,
  "externalReference" TEXT,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookIssue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WebhookIssue_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WebhookIssue_resolved_createdAt_idx" ON "WebhookIssue"("resolved", "createdAt");
CREATE INDEX "WebhookIssue_clientId_createdAt_idx" ON "WebhookIssue"("clientId", "createdAt");
