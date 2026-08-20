-- Personal-account automation is deliberately separate from the owner-only
-- Control Bot. No login secrets, OTPs or account sessions are stored here.
CREATE TYPE "PersonalPlatform" AS ENUM ('TELEGRAM', 'INSTAGRAM');
CREATE TYPE "PersonalMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TABLE "PersonalAssistantSettings" (
    "id" TEXT NOT NULL DEFAULT 'primary',
    "ownerPersona" TEXT NOT NULL DEFAULT '',
    "fullAutoReplies" BOOLEAN NOT NULL DEFAULT true,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalAssistantSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonalConversation" (
    "id" TEXT NOT NULL,
    "platform" "PersonalPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT,
    "personaNotes" TEXT NOT NULL DEFAULT '',
    "autoReply" BOOLEAN NOT NULL DEFAULT true,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PersonalConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonalMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "externalId" TEXT,
    "direction" "PersonalMessageDirection" NOT NULL,
    "text" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonalConversation_platform_externalId_key" ON "PersonalConversation"("platform", "externalId");
CREATE INDEX "PersonalConversation_platform_lastMessageAt_idx" ON "PersonalConversation"("platform", "lastMessageAt");
CREATE INDEX "PersonalMessage_conversationId_sentAt_idx" ON "PersonalMessage"("conversationId", "sentAt");
CREATE UNIQUE INDEX "PersonalMessage_conversationId_externalId_key" ON "PersonalMessage"("conversationId", "externalId");
ALTER TABLE "PersonalMessage" ADD CONSTRAINT "PersonalMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "PersonalConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
