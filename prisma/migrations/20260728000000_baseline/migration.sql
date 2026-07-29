CREATE TABLE IF NOT EXISTS "Client" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "mpAccessToken" TEXT,
  "webhookToken" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'CLIENT',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Device" (
  "id" TEXT NOT NULL,
  "idmaq" TEXT NOT NULL,
  "claimed" BOOLEAN NOT NULL DEFAULT false,
  "clientId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Device_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Device_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Machine" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "location" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Machine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Machine_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Esp32" (
  "id" TEXT NOT NULL,
  "machineId" TEXT NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "mqttTopic" TEXT NOT NULL,
  "online" BOOLEAN NOT NULL DEFAULT false,
  "lastSeen" TIMESTAMP(3),
  "credits" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "mpPosId" TEXT,
  "mpPosName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Esp32_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Esp32_machineId_fkey"
    FOREIGN KEY ("machineId") REFERENCES "Machine"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Payment" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "esp32Id" TEXT NOT NULL,
  "mpPaymentId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL,
  "externalRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Payment_esp32Id_fkey"
    FOREIGN KEY ("esp32Id") REFERENCES "Esp32"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TelemetryEvent" (
  "id" TEXT NOT NULL,
  "esp32Id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelemetryEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelemetryEvent_esp32Id_fkey"
    FOREIGN KEY ("esp32Id") REFERENCES "Esp32"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Client_email_key" ON "Client"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Client_webhookToken_key" ON "Client"("webhookToken");
CREATE UNIQUE INDEX IF NOT EXISTS "Device_idmaq_key" ON "Device"("idmaq");
CREATE UNIQUE INDEX IF NOT EXISTS "Esp32_serialNumber_key" ON "Esp32"("serialNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Esp32_mqttTopic_key" ON "Esp32"("mqttTopic");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_mpPaymentId_key" ON "Payment"("mpPaymentId");
