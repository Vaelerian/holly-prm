-- CreateTable
CREATE TABLE "UserAccessGrant" (
    "id" TEXT NOT NULL,
    "grantorId" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactShare" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactShare_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "projectId" TEXT;

-- AlterTable
ALTER TABLE "Interaction"
    ADD COLUMN "projectId" TEXT,
    ADD COLUMN "createdByUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "UserAccessGrant_grantorId_granteeId_key" ON "UserAccessGrant"("grantorId", "granteeId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactShare_contactId_userId_key" ON "ContactShare"("contactId", "userId");

-- AddForeignKey
ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_grantorId_fkey"
    FOREIGN KEY ("grantorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_granteeId_fkey"
    FOREIGN KEY ("granteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactShare" ADD CONSTRAINT "ContactShare_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactShare" ADD CONSTRAINT "ContactShare_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
