-- AlterTable
ALTER TABLE "AutomationRule" ADD COLUMN     "campaignId" TEXT;

-- CreateIndex
CREATE INDEX "AutomationRule_campaignId_idx" ON "AutomationRule"("campaignId");

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
