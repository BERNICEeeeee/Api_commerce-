UPDATE "User"
SET "role" = 'user'
WHERE "role" NOT IN ('user', 'admin');

ALTER TABLE "User"
ALTER COLUMN "role" SET DEFAULT 'user';

ALTER TABLE "User"
ADD CONSTRAINT "User_role_check" CHECK ("role" IN ('user', 'admin'));
