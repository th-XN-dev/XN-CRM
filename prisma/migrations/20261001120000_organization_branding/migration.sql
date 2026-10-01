-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "favicon_url" VARCHAR(2048),
ADD COLUMN     "language" VARCHAR(5) NOT NULL DEFAULT 'uz',
ADD COLUMN     "primary_color" CHAR(7) NOT NULL DEFAULT '#4F46E5',
ADD COLUMN     "secondary_color" CHAR(7);


-- Colors are stored as "#RRGGBB" only.
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_primary_color_hex" CHECK ("primary_color" ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_secondary_color_hex" CHECK ("secondary_color" IS NULL OR "secondary_color" ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_language_supported" CHECK ("language" IN ('uz', 'ru', 'en'));
