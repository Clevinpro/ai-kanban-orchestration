-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('GUIDE', 'DOCUMENTATION');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "type" "DocumentType" NOT NULL DEFAULT 'DOCUMENTATION';
