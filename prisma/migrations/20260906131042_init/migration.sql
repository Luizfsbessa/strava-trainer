-- CreateTable
CREATE TABLE "Workout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "distanceKm" REAL NOT NULL,
    "durationMinutes" REAL NOT NULL,
    "pace" TEXT NOT NULL,
    "elevationMeters" INTEGER NOT NULL,
    "activityDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
