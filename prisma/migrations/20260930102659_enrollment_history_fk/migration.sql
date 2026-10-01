-- DropForeignKey
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_transferred_from_id_fkey";

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_transferred_from_id_fkey" FOREIGN KEY ("transferred_from_id") REFERENCES "enrollments"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
