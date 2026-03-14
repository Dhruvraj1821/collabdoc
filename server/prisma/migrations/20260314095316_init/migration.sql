-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocMember" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "DocMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "parentsJson" TEXT NOT NULL,
    "op" JSONB NOT NULL,
    "sequenceNum" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" TEXT NOT NULL,
    "snapshotAfterEventId" TEXT NOT NULL,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "InviteLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "DocMember_userId_documentId_key" ON "DocMember"("userId", "documentId");

-- CreateIndex
CREATE INDEX "Event_documentId_sequenceNum_idx" ON "Event"("documentId", "sequenceNum");

-- CreateIndex
CREATE UNIQUE INDEX "Event_documentId_sequenceNum_key" ON "Event"("documentId", "sequenceNum");

-- CreateIndex
CREATE UNIQUE INDEX "InviteLink_token_key" ON "InviteLink"("token");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocMember" ADD CONSTRAINT "DocMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocMember" ADD CONSTRAINT "DocMember_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_snapshotAfterEventId_fkey" FOREIGN KEY ("snapshotAfterEventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteLink" ADD CONSTRAINT "InviteLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteLink" ADD CONSTRAINT "InviteLink_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
