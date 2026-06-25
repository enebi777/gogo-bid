-- DropForeignKey
ALTER TABLE "AdSet" DROP CONSTRAINT "AdSet_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "AiPrediction" DROP CONSTRAINT "AiPrediction_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "Alert" DROP CONSTRAINT "Alert_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "Click" DROP CONSTRAINT "Click_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "Conversion" DROP CONSTRAINT "Conversion_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "Cost" DROP CONSTRAINT "Cost_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "Forecast" DROP CONSTRAINT "Forecast_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "Revenue" DROP CONSTRAINT "Revenue_campaignId_fkey";

-- AddForeignKey
ALTER TABLE "AdSet" ADD CONSTRAINT "AdSet_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Click" ADD CONSTRAINT "Click_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revenue" ADD CONSTRAINT "Revenue_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiPrediction" ADD CONSTRAINT "AiPrediction_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Forecast" ADD CONSTRAINT "Forecast_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
