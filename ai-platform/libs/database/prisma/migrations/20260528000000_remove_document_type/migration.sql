-- Delete all GUIDE documents (FK cascade removes their chunks automatically)
DELETE FROM "documents" WHERE "type" = 'GUIDE'::"DocumentType";

-- Drop the type column from documents
ALTER TABLE "documents" DROP COLUMN "type";

-- Drop the DocumentType enum
DROP TYPE "DocumentType";
