-- DropForeignKey
ALTER TABLE "FlowSnapshot" DROP CONSTRAINT "FlowSnapshot_assignmentId_fkey";

-- AlterTable
ALTER TABLE "FlowSnapshot" ALTER COLUMN "assignmentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "FlowStep" ADD COLUMN     "templateComponents" JSONB[];

-- AddForeignKey
ALTER TABLE "FlowSnapshot" ADD CONSTRAINT "FlowSnapshot_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "FlowAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
