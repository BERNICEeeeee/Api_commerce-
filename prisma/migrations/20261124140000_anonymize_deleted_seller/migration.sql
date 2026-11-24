ALTER TABLE "Product"
ALTER COLUMN "vendeurId" DROP NOT NULL;

ALTER TABLE "Product"
DROP CONSTRAINT "Product_vendeurId_fkey";

ALTER TABLE "Product"
ADD CONSTRAINT "Product_vendeurId_fkey"
FOREIGN KEY ("vendeurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
