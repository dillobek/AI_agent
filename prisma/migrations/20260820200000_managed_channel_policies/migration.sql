CREATE TABLE "ManagedChannel" (
    "id" TEXT NOT NULL,
    "platform" "PersonalPlatform" NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentPolicyMarkdown" TEXT NOT NULL DEFAULT '',
    "policyFileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManagedChannel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManagedChannel_platform_channelId_key" ON "ManagedChannel"("platform", "channelId");
