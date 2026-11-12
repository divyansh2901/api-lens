ALTER TABLE "RequestLog" ADD COLUMN "eventId" TEXT;

CREATE UNIQUE INDEX "RequestLog_eventId_key" ON "RequestLog"("eventId");
