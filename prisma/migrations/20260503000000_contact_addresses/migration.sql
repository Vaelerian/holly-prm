-- Add a JSON array of structured addresses to Contact. Each entry is an
-- object with label, line1, line2, city, region, postcode, country.
ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "addresses" JSONB NOT NULL DEFAULT '[]';
