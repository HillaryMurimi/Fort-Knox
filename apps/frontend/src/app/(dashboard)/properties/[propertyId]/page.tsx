"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Building2, MapPin, Plus } from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import { usePropertyQuery } from "@/hooks/queries/use-property-queries";
import {
  useBuildingsQuery,
  useFloorsQuery,
  useUnitsQuery,
} from "@/hooks/queries/use-hierarchy-queries";
import { useSetupPermission } from "@/hooks/use-setup-permission";
import { BuildingForm } from "@/components/properties/building-form";
import { StatusBadge,  Dialog } from "@/components/ui";

const money = (value: number) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);

export default function PropertyDetailPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = use(params);
  const { activeOrganizationId } = useOrganization();
  const property = usePropertyQuery(activeOrganizationId, propertyId);
  const buildings = useBuildingsQuery(activeOrganizationId, propertyId);
  const floors = useFloorsQuery(activeOrganizationId);
  const units = useUnitsQuery(activeOrganizationId);
  const canAddBuilding = useSetupPermission(
    activeOrganizationId,
    "building.create",
  );
  const canViewRent = useSetupPermission(activeOrganizationId, "rent.view");
  const [adding, setAdding] = useState(false);
  if (!activeOrganizationId)
    return <p role="status">Select an organization to view this property.</p>;
  if (
    property.isLoading ||
    buildings.isLoading ||
    floors.isLoading ||
    units.isLoading
  )
    return <p role="status">Loading property hierarchy...</p>;
  if (property.isError || buildings.isError || floors.isError || units.isError)
    return (
      <div role="alert">
        <p>Property hierarchy could not be loaded.</p>
        <button
          className="btn-secondary mt-3"
          onClick={() =>
            void Promise.all([
              property.refetch(),
              buildings.refetch(),
              floors.refetch(),
              units.refetch(),
            ])
          }
        >
          Retry
        </button>
      </div>
    );
  if (!property.data) return <p role="status">Property not found.</p>;
  const buildingRows = buildings.data || [];
  const unitRows = (units.data || []).filter(
    (unit) => unit.propertyId === propertyId,
  );
  const activeUnits = unitRows.filter((unit) => unit.status !== "INACTIVE");
  const vacantUnits = activeUnits.filter((unit) => unit.status === "VACANT");
  const potentialRent = activeUnits.reduce(
    (sum, unit) => sum + (unit.monthlyRent || 0),
    0,
  );
  return (
    <main className="space-y-8">
      <Link
        href="/properties"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Back to properties
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-400">
            Property passport / {property.data.code}
          </p>
          <h1 className="mt-2 text-3xl font-medium sm:text-4xl">
            {property.data.name}
          </h1>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin size={15} />
            {property.data.address.addressLine1}, {property.data.address.city}
            {property.data.address.county
              ? `, ${property.data.address.county}`
              : ""}
          </p>
        </div>
        {canAddBuilding && (
          <button className="btn-primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add building
          </button>
        )}
      </header>
      <div className="grid gap-4 border-y border-border py-6 sm:grid-cols-4">
        <Metric label="Buildings" value={buildingRows.length} />
        <Metric label="Units" value={activeUnits.length} />
        <Metric label="Vacant" value={vacantUnits.length} />
        {canViewRent && (
          <Metric
            label="Full occupancy asking rent"
            value={money(potentialRent)}
          />
        )}
      </div>
      <div>
        <h2 className="text-lg font-semibold">Site structure</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Expand a building to see its floors and units. Active tenancy rent
          remains separate.
        </p>
        <div className="mt-5 space-y-4">
          {buildingRows.length ? (
            buildingRows.map((building) => {
              const buildingFloors = (floors.data || []).filter(
                (floor) => floor.buildingId === building._id,
              );
              return (
                <details
                  key={building._id}
                  className="border-t border-border pt-4"
                  open={buildingRows.length === 1}
                >
                  <summary className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
                    <Building2 size={17} />
                    {building.name}
                    <span className="font-normal text-muted-foreground">
                      {buildingFloors.length} floors ·{" "}
                      {
                        unitRows.filter(
                          (unit) => unit.buildingId === building._id,
                        ).length
                      }{" "}
                      units
                    </span>
                  </summary>
                  <div className="ml-2 mt-4 space-y-4 border-l border-border pl-5">
                    {buildingFloors.map((floor) => {
                      const floorUnits = unitRows.filter(
                        (unit) => unit.floorId === floor._id,
                      );
                      return (
                        <div key={floor._id}>
                          <Link
                            href={`/floors/${floor._id}`}
                            className="text-sm font-semibold hover:underline"
                          >
                            {floor.name}
                          </Link>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {floorUnits.length} units
                          </span>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {floorUnits.map((unit) => (
                              <Link
                                key={unit._id}
                                href={`/units/${unit._id}`}
                                className="min-w-32 border border-border px-3 py-2 text-xs hover:border-foreground/50"
                              >
                                <span className="block font-semibold">
                                  {unit.name}
                                </span>
                                <span className="mt-1 block text-muted-foreground">
                                  {unit.unitTypeLabel ||
                                    unit.unitType.replaceAll("_", " ")}{" "}
                                  · <StatusBadge status={unit.status} domain="unit" />
                                </span>
                                {canViewRent &&
                                  typeof unit.monthlyRent === "number" && (
                                    <span className="mt-1 block tabular-nums">
                                      {money(unit.monthlyRent)}
                                    </span>
                                  )}
                              </Link>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">No buildings yet.</p>
          )}
        </div>
      </div>
      <Dialog open={adding} onOpenChange={setAdding} title="Add building">
        {adding && (
          <BuildingForm
            organizationId={activeOrganizationId}
            propertyId={propertyId}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
      </Dialog>
    </main>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-2xl font-medium tabular-nums">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
