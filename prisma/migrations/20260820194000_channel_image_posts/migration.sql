CREATE TYPE "ChannelPostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'FAILED');

CREATE TABLE "ChannelPost" (
    "id" TEXT NOT NULL,
    "platform" "PersonalPlatform" NOT NULL,
    "channelId" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "imagePrompt" TEXT,
    "imageUrl" TEXT,
    "status" "ChannelPostStatus" NOT NULL DEFAULT 'DRAFT',
    "error" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChannelPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChannelPost_platform_channelId_status_idx" ON "ChannelPost"("platform", "channelId", "status");
CREATE INDEX "ChannelPost_createdAt_idx" ON "ChannelPost"("createdAt");
