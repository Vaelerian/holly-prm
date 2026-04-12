-- VaultConfig
CREATE TABLE "VaultConfig" (
    "id" TEXT NOT NULL,
    "couchDbUrl" TEXT NOT NULL DEFAULT 'http://localhost:5984',
    "couchDbDatabase" TEXT NOT NULL DEFAULT 'obsidian',
    "couchDbUsername" TEXT NOT NULL,
    "couchDbPassword" TEXT NOT NULL,
    "e2ePassphrase" TEXT NOT NULL,
    "workdayCron" TEXT NOT NULL DEFAULT '0 * * * 1-5',
    "weekendCron" TEXT NOT NULL DEFAULT '0 */4 * * 0,6',
    "lastSyncAt" TIMESTAMP(3),
    "lastSeq" TEXT NOT NULL DEFAULT '0',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VaultConfig_pkey" PRIMARY KEY ("id")
);

-- VaultNote
CREATE TABLE "VaultNote" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "couchDbId" TEXT NOT NULL,
    "notePath" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VaultNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VaultNote_entityType_entityId_key" ON "VaultNote"("entityType", "entityId");
