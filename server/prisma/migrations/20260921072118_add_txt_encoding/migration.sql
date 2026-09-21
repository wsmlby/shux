-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Book" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "description" TEXT,
    "isbn" TEXT,
    "publishedAt" TEXT,
    "hasCover" BOOLEAN NOT NULL DEFAULT false,
    "fileSize" INTEGER NOT NULL,
    "encoding" TEXT NOT NULL DEFAULT 'utf-8',
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "seriesId" TEXT,
    "volumeNumber" REAL,
    "volumeLabel" TEXT,
    "seriesOverride" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Book_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Book" ("addedAt", "author", "description", "fileSize", "format", "hasCover", "id", "isbn", "path", "publishedAt", "seriesId", "seriesOverride", "title", "updatedAt", "volumeLabel", "volumeNumber") SELECT "addedAt", "author", "description", "fileSize", "format", "hasCover", "id", "isbn", "path", "publishedAt", "seriesId", "seriesOverride", "title", "updatedAt", "volumeLabel", "volumeNumber" FROM "Book";
DROP TABLE "Book";
ALTER TABLE "new_Book" RENAME TO "Book";
CREATE UNIQUE INDEX "Book_path_key" ON "Book"("path");
CREATE INDEX "Book_seriesId_idx" ON "Book"("seriesId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
