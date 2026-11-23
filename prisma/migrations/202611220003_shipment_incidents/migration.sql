CREATE TABLE "ShipmentIncident" (
  "id" TEXT PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE, "shipmentId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL, "actorLabel" TEXT NOT NULL, "phase" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "description" TEXT NOT NULL, "nextAction" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipmentIncident_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ShipmentIncident_shipmentId_createdAt_idx" ON "ShipmentIncident"("shipmentId", "createdAt");
CREATE TABLE "IncidentResolution" (
  "id" TEXT PRIMARY KEY, "incidentId" TEXT NOT NULL UNIQUE, "actorUserId" TEXT NOT NULL,
  "actorLabel" TEXT NOT NULL, "description" TEXT NOT NULL, "nextAction" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncidentResolution_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "ShipmentIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE FUNCTION "reject_incident_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de incidencias son inmutables';
END;
$$;
CREATE TRIGGER "ShipmentIncident_immutable" BEFORE UPDATE OR DELETE ON "ShipmentIncident" FOR EACH ROW EXECUTE FUNCTION "reject_incident_change"();
CREATE TRIGGER "IncidentResolution_immutable" BEFORE UPDATE OR DELETE ON "IncidentResolution" FOR EACH ROW EXECUTE FUNCTION "reject_incident_change"();
