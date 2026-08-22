CREATE TYPE "PlanItemStatus" AS ENUM ('PENDING', 'DONE', 'CANCELLED');

CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "PlanItemStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanItem_scheduledFor_status_idx" ON "PlanItem"("scheduledFor", "status");
