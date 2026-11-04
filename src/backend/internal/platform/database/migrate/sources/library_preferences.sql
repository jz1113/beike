CREATE TABLE "WorkspaceLibraryPreferences" (
    "workspaceId" TEXT PRIMARY KEY NOT NULL,
    "showEntry" INTEGER NOT NULL DEFAULT 1 CHECK ("showEntry" IN (0,1)),
    "sharingEnabled" INTEGER NOT NULL DEFAULT 0 CHECK ("sharingEnabled" IN (0,1))
);
