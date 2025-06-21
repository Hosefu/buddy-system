-- AlterTable
ALTER TABLE "Flow" ADD COLUMN     "stepsCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "FlowStep" ADD COLUMN     "componentsCount" INTEGER NOT NULL DEFAULT 0;
