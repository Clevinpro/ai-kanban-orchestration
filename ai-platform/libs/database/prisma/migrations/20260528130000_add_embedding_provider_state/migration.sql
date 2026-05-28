-- CreateTable
CREATE TABLE "embedding_provider_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embedding_provider_state_pkey" PRIMARY KEY ("id")
);
