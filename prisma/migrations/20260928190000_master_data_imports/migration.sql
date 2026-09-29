-- CreateTable
CREATE TABLE "master_data_imports" (
    "id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "source_kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'previewed',
    "uploaded_by" UUID NOT NULL,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "preview" JSONB NOT NULL DEFAULT '{}',
    "report" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMPTZ(6),

    CONSTRAINT "master_data_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "master_data_imports_created_at_idx" ON "master_data_imports"("created_at");

-- CreateIndex
CREATE INDEX "master_data_imports_status_idx" ON "master_data_imports"("status");

-- AddForeignKey
ALTER TABLE "master_data_imports" ADD CONSTRAINT "master_data_imports_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
