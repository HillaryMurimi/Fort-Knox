"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CircleHelp,
  Copy,
  MapPin,
  Plus,
  Trash2,
} from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import { useSetupPermission } from "@/hooks/use-setup-permission";
import { queryKeys } from "@/lib/data/query-keys";
import {
  generateSetup,
  propertySetupClient,
  summarizeSetup,
  type PropertySetupInput,
  type SetupBuilding,
  type UnitMix,
} from "@/lib/data/property-setup";
import type { Property, Unit } from "@/lib/data/resource-types";

const types: Array<{ value: Unit["unitType"]; label: string }> = (
  [
    ["SINGLE_ROOM", "Single room"],
    ["BEDSITTER", "Bedsitter"],
    ["STUDIO", "Studio"],
    ["ONE_BEDROOM", "1 bedroom"],
    ["TWO_BEDROOM", "2 bedroom"],
    ["THREE_PLUS_BEDROOM", "3 bedroom"],
    ["FOUR_BEDROOM", "4 bedroom"],
    ["FIVE_PLUS_BEDROOM", "5+ bedroom"],
    ["MAISONETTE", "Maisonette"],
    ["SHOP", "Shop"],
    ["OFFICE", "Office"],
    ["COMMERCIAL_UNIT", "Commercial unit"],
    ["OTHER", "Custom type"],
  ] as Array<[Unit["unitType"], string]>
).map(([value, label]) => ({ value, label }));
const steps = ["Property", "Structure", "Unit layout", "Review"];
const money = (value: number) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
const codePattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function PropertySetupWizard() {
  const router = useRouter();
  const qc = useQueryClient();
  const reduced = useReducedMotion();
  const { activeOrganizationId } = useOrganization();
  const canCreate = useSetupPermission(activeOrganizationId, "property.create");
  const [step, setStep] = useState(0);
  const [property, setProperty] = useState<PropertySetupInput["property"]>({
    name: "",
    code: "",
    propertyType: "APARTMENT",
    address: { addressLine1: "", city: "", country: "Kenya" },
  });
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [mode, setMode] =
    useState<PropertySetupInput["structureMode"]>("BUILDINGS");
  const [buildingNames, setBuildingNames] = useState(["Building A"]);
  const [floorCount, setFloorCount] = useState(4);
  const [includeGround, setIncludeGround] = useState(true);
  const [prefix, setPrefix] = useState("");
  const [startAt, setStartAt] = useState(1);
  const [mix, setMix] = useState<UnitMix[]>([
    { unitType: "ONE_BEDROOM", count: 2, monthlyRent: 18000 },
  ]);
  const [buildings, setBuildings] = useState<SetupBuilding[]>([]);
  const [previewPage, setPreviewPage] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const summary = useMemo(() => summarizeSetup(buildings), [buildings]);
  const rows = useMemo(
    () =>
      buildings.flatMap((building, bi) =>
        building.floors.flatMap((floor, fi) =>
          floor.units.map((unit, ui) => ({
            building,
            floor,
            unit,
            bi,
            fi,
            ui,
          })),
        ),
      ),
    [buildings],
  );

  function updateUnit(
    bi: number,
    fi: number,
    ui: number,
    key: "name" | "code" | "monthlyRent" | "unitType" | "unitTypeLabel",
    value: string,
  ) {
    setBuildings((previous) =>
      previous.map((building, b) =>
        b !== bi
          ? building
          : {
              ...building,
              floors: building.floors.map((floor, f) =>
                f !== fi
                  ? floor
                  : {
                      ...floor,
                      units: floor.units.map((unit, u) =>
                        u !== ui
                          ? unit
                          : {
                              ...unit,
                              [key]:
                                key === "monthlyRent" ? Number(value) : value,
                            },
                      ),
                    },
              ),
            },
      ),
    );
  }
  function updateFloor(
    bi: number,
    fi: number,
    key: "name" | "code" | "level",
    value: string,
  ) {
    setBuildings((previous) =>
      previous.map((building, b) =>
        b !== bi
          ? building
          : {
              ...building,
              floors: building.floors.map((floor, f) =>
                f !== fi
                  ? floor
                  : {
                      ...floor,
                      [key]: key === "level" ? Number(value) : value,
                    },
              ),
            },
      ),
    );
  }
  function duplicateFloor(bi: number, fi: number) {
    setBuildings(previous => previous.map((building, index) => {
      if (index !== bi || building.floors.length >= 100) return building;
      const source = building.floors[fi];
      if (!source) return building;
      const level = Math.max(...building.floors.map(floor => floor.level)) + 1;
      if (level > 300) return building;
      const code = `F${level}`;
      return { ...building, floors: [...building.floors, { ...source, name: `Floor ${level}`, code, level, units: source.units.map((unit, index) => {
        const unitCode = `${building.code}-${code}-${String(index + startAt).padStart(2, '0')}`;
        return { ...unit, name: unitCode, code: unitCode };
      }) }] };
    }));
  }
  function validateReview(): string | null {
    if (!buildings.length || rows.length === 0)
      return "Generate at least one unit.";
    if (rows.length > 500) return "Create at most 500 units in one setup.";
    const buildingCodes = new Set<string>();
    for (const building of buildings) {
      if (
        !building.name.trim() ||
        !codePattern.test(building.code) ||
        buildingCodes.has(building.code.toUpperCase())
      )
        return "Building names and unique codes are required.";
      buildingCodes.add(building.code.toUpperCase());
      const floorCodes = new Set<string>();
      const levels = new Set<number>();
      const unitCodes = new Set<string>();
      for (const floor of building.floors) {
        if (
          !floor.name.trim() ||
          !codePattern.test(floor.code) ||
          floorCodes.has(floor.code.toUpperCase()) ||
          levels.has(floor.level)
        )
          return "Each floor needs a name, a unique code, and a unique level.";
        floorCodes.add(floor.code.toUpperCase());
        levels.add(floor.level);
        for (const unit of floor.units) {
          if (
            !unit.name.trim() ||
            !codePattern.test(unit.code) ||
            unitCodes.has(unit.code.toUpperCase())
          )
            return "Every unit needs a name and a unique code within its building.";
          if (!Number.isFinite(unit.monthlyRent) || unit.monthlyRent < 0)
            return "Monthly rent cannot be negative.";
          if (Math.abs(unit.monthlyRent * 100 - Math.round(unit.monthlyRent * 100)) > 0.000001)
            return "Monthly rent may have at most two decimal places.";
          if (unit.unitType === "OTHER" && !unit.unitTypeLabel?.trim())
            return "Name each custom unit type.";
          unitCodes.add(unit.code.toUpperCase());
        }
      }
    }
    return null;
  }
  function next() {
    setError("");
    if (step === 0) {
      if ((latitude && !longitude) || (!latitude && longitude) || (latitude && (Number(latitude) < -90 || Number(latitude) > 90)) || (longitude && (Number(longitude) < -180 || Number(longitude) > 180))) {
        setError("Enter both valid latitude and longitude, or leave both empty.");
        return;
      }
      if (
        !property.name.trim() ||
        !codePattern.test(property.code) ||
        !property.address.addressLine1.trim() ||
        !property.address.city.trim() ||
        !property.address.country.trim()
      ) {
        setError(
          "Enter a property name, valid code, address, city and country.",
        );
        return;
      }
    }
    if (step === 1) {
      if (
        mode === "BUILDINGS" &&
        (buildingNames.length < 1 ||
          buildingNames.length > 20 ||
          buildingNames.some((name) => !name.trim()) ||
          new Set(buildingNames.map((name) => name.trim().toLowerCase()))
            .size !== buildingNames.length)
      ) {
        setError("Add 1 to 20 buildings with distinct names.");
        return;
      }
      if (
        floorCount < 1 ||
        floorCount > 100 ||
        !Number.isInteger(floorCount) ||
        startAt < 1 ||
        !Number.isInteger(startAt) ||
        (prefix && !codePattern.test(prefix))
      ) {
        setError("Check the floor count, starting number and unit prefix.");
        return;
      }
    }
    if (step === 2) {
      if (
        !mix.length ||
        mix.some(
          (item) =>
            !Number.isInteger(item.count) ||
            item.count < 1 ||
            item.count > 100 ||
            !Number.isFinite(item.monthlyRent) ||
            item.monthlyRent < 0 ||
            Math.abs(item.monthlyRent * 100 - Math.round(item.monthlyRent * 100)) > 0.000001 ||
            (item.unitType === "OTHER" && !item.unitTypeLabel?.trim()),
        )
      ) {
        setError(
          "Each unit type needs a quantity, a non-negative rent and a name for custom types.",
        );
        return;
      }
      const generated = generateSetup(
        mode === "STANDALONE" ? ["Site"] : buildingNames,
        floorCount,
        includeGround,
        mix,
        mode,
        prefix,
        startAt,
      );
      if (
        summarizeSetup(generated).unitCount > 500 ||
        generated.some((building) =>
          building.floors.some((floor) => floor.units.length > 100),
        )
      ) {
        setError("Limit setup to 500 units total and 100 units per floor.");
        return;
      }
      setBuildings(generated);
      setPreviewPage(0);
    }
    setStep((value) => value + 1);
  }
  async function save() {
    const problem = validateReview();
    if (problem) {
      setError(problem);
      return;
    }
    if (!activeOrganizationId) {
      setError("Select an organization first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await propertySetupClient.create(activeOrganizationId, {
        property: latitude && longitude ? { ...property, location: { type: "Point", coordinates: [Number(longitude), Number(latitude)] } } : property,
        structureMode: mode,
        buildings,
      });
      setSavedId(result.propertyId);
      await Promise.all(
        [
          queryKeys.properties.all(activeOrganizationId),
          queryKeys.buildings.all(activeOrganizationId),
          queryKeys.floors.all(activeOrganizationId),
          queryKeys.units.all(activeOrganizationId),
        ].map((queryKey) => qc.invalidateQueries({ queryKey })),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Setup could not be saved. Review the details and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!activeOrganizationId || !canCreate)
    return (
      <div className="mx-auto max-w-3xl py-12">
        <h1 className="text-2xl font-semibold">Property setup unavailable</h1>
        <p className="mt-2 text-muted-foreground">
          Select an organization with permission to create properties.
        </p>
        <Link href="/properties" className="btn-secondary mt-6 inline-flex">
          Back to properties
        </Link>
      </div>
    );
  if (savedId)
    return (
      <main className="mx-auto max-w-3xl py-12 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <Check size={30} />
        </div>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Portfolio ready
        </p>
        <h1 className="mt-2 text-4xl font-medium">{property.name} is ready.</h1>
        <p className="mt-4 text-muted-foreground">
          {summary.buildingCount} buildings · {summary.floorCount} floors ·{" "}
          {summary.unitCount} units
        </p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">
          {money(summary.estimatedMonthlyRent)}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            potential monthly asking rent
          </span>
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link className="btn-primary" href={`/properties/${savedId}`}>
            View property <ArrowRight size={16} />
          </Link>
          <Link className="btn-secondary" href="/tenants">
            Add tenants
          </Link>
          <button
            className="btn-secondary"
            onClick={() => router.push("/dashboard")}
          >
            Command Center
          </button>
        </div>
      </main>
    );

  return (
    <main className="mx-auto max-w-7xl pb-16">
      <div className="mb-8 flex items-center justify-between">
        <Link
          href="/properties"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} /> Portfolio
        </Link>
        <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Property setup
        </span>
      </div>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div
            className="mb-8 flex items-center gap-2"
            aria-label="Setup progress"
          >
            {steps.map((label, index) => (
              <div key={label} className="min-w-0 flex-1">
                <div
                  className={`h-1 rounded-sm ${index <= step ? "bg-emerald-700 dark:bg-emerald-500" : "bg-border"}`}
                />
                <span
                  className={`mt-2 block truncate text-xs ${index === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                >
                  {String(index + 1).padStart(2, "0")} {label}
                </span>
              </div>
            ))}
          </div>
          <motion.div
            key={step}
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            {step === 0 && (
              <section>
                <Eyebrow number="01" title="The asset" />
                <h1 className="mt-3 text-3xl font-medium sm:text-4xl">
                  Start with the property.
                </h1>
                <p className="mt-3 max-w-xl text-muted-foreground">
                  A clear identity and location keep every future unit, tenant
                  and work order in context.
                </p>
                <div className="mt-8 grid gap-5 sm:grid-cols-2">
                  <Field label="Property name">
                    <input
                      required
                      value={property.name}
                      onChange={(event) =>
                        setProperty({ ...property, name: event.target.value })
                      }
                      placeholder="Riverside Apartments"
                    />
                  </Field>
                  <Field label="Property code">
                    <input
                      required
                      value={property.code}
                      onChange={(event) =>
                        setProperty({
                          ...property,
                          code: event.target.value.toUpperCase(),
                        })
                      }
                      placeholder="RIVERSIDE"
                    />
                  </Field>
                  <Field label="Property type">
                    <select
                      value={property.propertyType}
                      onChange={(event) =>
                        setProperty({
                          ...property,
                          propertyType: event.target
                            .value as Property["propertyType"],
                        })
                      }
                    >
                      {[
                        "APARTMENT",
                        "RESIDENTIAL_ESTATE",
                        "COMMERCIAL",
                        "MIXED_USE",
                        "OFFICE",
                        "RETAIL",
                        "WAREHOUSE",
                        "OTHER",
                      ].map((type) => (
                        <option key={type} value={type}>
                          {type.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Street or location label">
                    <input
                      required
                      value={property.address.addressLine1}
                      onChange={(event) =>
                        setProperty({
                          ...property,
                          address: {
                            ...property.address,
                            addressLine1: event.target.value,
                          },
                        })
                      }
                      placeholder="Riverside Drive"
                    />
                  </Field>
                  <Field label="City or town">
                    <input
                      required
                      value={property.address.city}
                      onChange={(event) =>
                        setProperty({
                          ...property,
                          address: {
                            ...property.address,
                            city: event.target.value,
                          },
                        })
                      }
                      placeholder="Nairobi"
                    />
                  </Field>
                  <Field label="County or region">
                    <input
                      value={property.address.county || ""}
                      onChange={(event) =>
                        setProperty({
                          ...property,
                          address: {
                            ...property.address,
                            county: event.target.value,
                          },
                        })
                      }
                      placeholder="Nairobi County"
                    />
                  </Field>
                  <Field label="Country">
                    <input
                      required
                      value={property.address.country}
                      onChange={(event) =>
                        setProperty({
                          ...property,
                          address: {
                            ...property.address,
                            country: event.target.value,
                          },
                        })
                      }
                    />
                  </Field>
                </div>
                <details className="mt-8 border-t border-border pt-5">
                  <summary className="cursor-pointer text-sm font-medium">
                    More location details
                  </summary>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <Field label="Address detail / estate">
                      <input
                        value={property.address.addressLine2 || ""}
                        onChange={(event) =>
                          setProperty({
                            ...property,
                            address: {
                              ...property.address,
                              addressLine2: event.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                    <Field label="Postal code">
                      <input
                        value={property.address.postalCode || ""}
                        onChange={(event) =>
                          setProperty({
                            ...property,
                            address: {
                              ...property.address,
                              postalCode: event.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                    <Field label="Latitude">
                      <input
                        type="number"
                        step="any"
                        min="-90"
                        max="90"
                        value={latitude}
                        onChange={(event) => setLatitude(event.target.value)}
                      />
                    </Field>
                    <Field label="Longitude">
                      <input
                        type="number"
                        step="any"
                        min="-180"
                        max="180"
                        value={longitude}
                        onChange={(event) => setLongitude(event.target.value)}
                      />
                    </Field>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    <MapPin size={13} className="mr-1 inline" />
                    Map services are optional. Coordinates can be added
                    manually.
                  </p>
                </details>
              </section>
            )}
            {step === 1 && (
              <section>
                <Eyebrow number="02" title="Architecture" />
                <h1 className="mt-3 text-3xl font-medium sm:text-4xl">
                  Shape the property.
                </h1>
                <p className="mt-3 text-muted-foreground">
                  Start with a repeated layout. You can refine floor and unit
                  details before saving.
                </p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {(["BUILDINGS", "STANDALONE"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMode(value)}
                      aria-pressed={mode === value}
                      className={`min-h-28 border p-5 text-left transition-colors ${mode === value ? "border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30" : "border-border hover:border-foreground/30"}`}
                    >
                      <Building2 size={20} />
                      <strong className="mt-3 block text-sm">
                        {value === "BUILDINGS"
                          ? "Building and floors"
                          : "Standalone homes or units"}
                      </strong>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {value === "BUILDINGS"
                          ? "Apartment blocks, estates and mixed-use buildings."
                          : "One site with ground-level units; the internal hierarchy supports operations."}
                      </span>
                    </button>
                  ))}
                </div>
                {mode === "BUILDINGS" && (
                  <div className="mt-8">
                    <h2 className="text-sm font-semibold">Buildings</h2>
                    <div className="mt-3 space-y-3">
                      {buildingNames.map((name, index) => (
                        <div className="flex gap-2" key={index}>
                          <input
                            aria-label={`Building ${index + 1} name`}
                            value={name}
                            onChange={(event) =>
                              setBuildingNames((previous) =>
                                previous.map((item, i) =>
                                  i === index ? event.target.value : item,
                                ),
                              )
                            }
                          />
                          <button
                            type="button"
                            aria-label={`Remove building ${index + 1}`}
                            title="Remove building"
                            disabled={buildingNames.length === 1}
                            className="btn-secondary shrink-0"
                            onClick={() =>
                              setBuildingNames((previous) =>
                                previous.filter((_, i) => i !== index),
                              )
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn-secondary mt-3"
                      onClick={() =>
                        setBuildingNames((previous) => [
                          ...previous,
                          `Building ${String.fromCharCode(65 + previous.length)}`,
                        ])
                      }
                    >
                      <Plus size={16} /> Add building
                    </button>
                  </div>
                )}
                <div className="mt-8 grid gap-5 border-t border-border pt-6 sm:grid-cols-2">
                  <Field label="Floors per building">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={mode === "STANDALONE" ? 1 : floorCount}
                      disabled={mode === "STANDALONE"}
                      onChange={(event) =>
                        setFloorCount(Number(event.target.value))
                      }
                    />
                  </Field>
                  <Field label="First unit number">
                    <input
                      type="number"
                      min="1"
                      value={startAt}
                      onChange={(event) =>
                        setStartAt(Number(event.target.value))
                      }
                    />
                  </Field>
                  <Field label="Unit code prefix (optional)">
                    <input
                      value={prefix}
                      onChange={(event) =>
                        setPrefix(event.target.value.toUpperCase())
                      }
                      placeholder="Uses building code by default"
                    />
                  </Field>
                  {mode === "BUILDINGS" && (
                    <label className="flex items-center gap-3 self-end pb-2 text-sm">
                      <input
                        type="checkbox"
                        checked={includeGround}
                        onChange={(event) =>
                          setIncludeGround(event.target.checked)
                        }
                        className="size-4"
                      />{" "}
                      Include ground floor
                    </label>
                  )}
                </div>
              </section>
            )}
            {step === 2 && (
              <section>
                <Eyebrow number="03" title="Unit composition" />
                <h1 className="mt-3 text-3xl font-medium sm:text-4xl">
                  One layout, repeated.
                </h1>
                <p className="mt-3 text-muted-foreground">
                  Specify what goes on each floor. Rent is the asking rent for a
                  new tenancy, never a change to an active lease.
                </p>
                <div className="mt-8 space-y-4">
                  {mix.map((item, index) => (
                    <div
                      key={index}
                      className="grid gap-4 border-b border-border pb-5 sm:grid-cols-[minmax(0,1fr)_100px_150px_40px]"
                    >
                      <Field label="Unit type">
                        <select
                          value={item.unitType}
                          onChange={(event) =>
                            setMix((previous) =>
                              previous.map((row, i) =>
                                i === index
                                  ? {
                                      ...row,
                                      unitType: event.target
                                        .value as Unit["unitType"],
                                    }
                                  : row,
                              ),
                            )
                          }
                        >
                          {types.map((type) => (
                            <option value={type.value} key={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Per floor">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={item.count}
                          onChange={(event) =>
                            setMix((previous) =>
                              previous.map((row, i) =>
                                i === index
                                  ? {
                                      ...row,
                                      count: Number(event.target.value),
                                    }
                                  : row,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="Monthly rent · KES">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.monthlyRent}
                          onChange={(event) =>
                            setMix((previous) =>
                              previous.map((row, i) =>
                                i === index
                                  ? {
                                      ...row,
                                      monthlyRent: Number(event.target.value),
                                    }
                                  : row,
                              ),
                            )
                          }
                        />
                      </Field>
                      <button
                        type="button"
                        aria-label={`Remove unit type ${index + 1}`}
                        title="Remove unit type"
                        disabled={mix.length === 1}
                        className="btn-secondary self-end"
                        onClick={() =>
                          setMix((previous) =>
                            previous.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                      {item.unitType === "OTHER" && (
                        <div className="sm:col-span-full">
                          <Field label="Custom type name">
                            <input
                              required
                              value={item.unitTypeLabel || ""}
                              onChange={(event) =>
                                setMix((previous) =>
                                  previous.map((row, i) =>
                                    i === index
                                      ? {
                                          ...row,
                                          unitTypeLabel: event.target.value,
                                        }
                                      : row,
                                  ),
                                )
                              }
                              placeholder="Executive studio"
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-secondary mt-4"
                  onClick={() =>
                    setMix((previous) => [
                      ...previous,
                      { unitType: "STUDIO", count: 1, monthlyRent: 0 },
                    ])
                  }
                >
                  <Plus size={16} /> Add unit type
                </button>
                <p className="mt-5 flex items-start gap-2 text-xs text-muted-foreground">
                  <Copy size={15} className="shrink-0" /> This layout will be
                  duplicated across every floor and building. Individual units
                  can be edited on the next screen.
                </p>
              </section>
            )}
            {step === 3 && (
              <section>
                <Eyebrow number="04" title="Review and confirm" />
                <h1 className="mt-3 text-3xl font-medium sm:text-4xl">
                  Everything in its place.
                </h1>
                <p className="mt-3 text-muted-foreground">
                  Review the hierarchy and adjust any unit before committing.
                  Nothing is saved yet.
                </p>
                <div className="mt-8 grid grid-cols-2 gap-4 border-y border-border py-5 sm:grid-cols-4">
                  <Metric value={summary.buildingCount} label="Buildings" />
                  <Metric value={summary.floorCount} label="Floors" />
                  <Metric value={summary.unitCount} label="Units" />
                  <Metric
                    value={money(summary.estimatedMonthlyRent)}
                    label="Monthly potential"
                  />
                </div>
                <div className="mt-7 flex flex-wrap gap-3 text-sm">
                  {Object.entries(summary.mix).map(([type, count]) => (
                    <span
                      key={type}
                      className="border-l-2 border-emerald-700 pl-2"
                    >
                      {count} ×{" "}
                      {types.find((item) => item.value === type)?.label || type}
                    </span>
                  ))}
                </div>
                <div className="mt-8 space-y-5">
                  {buildings.map((building, bi) => (
                    <details
                      key={bi}
                      open={buildings.length === 1}
                      className="border-t border-border pt-4"
                    >
                      <summary className="cursor-pointer font-semibold">
                        {building.name}{" "}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {building.floors.length} floors ·{" "}
                          {building.floors.reduce(
                            (sum, floor) => sum + floor.units.length,
                            0,
                          )}{" "}
                          units
                        </span>
                      </summary>
                      <div className="mt-4 space-y-4">
                        {building.floors.map((floor, fi) => (
                          <div
                            key={fi}
                            className="border-l-2 border-border pl-4"
                          >
                            <div className="flex flex-wrap items-center gap-3">
                              <input
                                aria-label={`${building.name} floor name`}
                                className="max-w-48"
                                value={floor.name}
                                onChange={(event) =>
                                  updateFloor(
                                    bi,
                                    fi,
                                    "name",
                                    event.target.value,
                                  )
                                }
                              />
                              <input
                                aria-label={`${building.name} ${floor.name} code`}
                                className="max-w-24"
                                value={floor.code}
                                onChange={(event) =>
                                  updateFloor(
                                    bi,
                                    fi,
                                    "code",
                                    event.target.value.toUpperCase(),
                                  )
                                }
                              />
                              <input
                                aria-label={`${building.name} ${floor.name} level`}
                                type="number"
                                min="-10"
                                max="300"
                                className="max-w-20"
                                value={floor.level}
                                onChange={(event) =>
                                  updateFloor(
                                    bi,
                                    fi,
                                    "level",
                                    event.target.value,
                                  )
                                }
                              />
                              <span className="text-xs text-muted-foreground">
                                {floor.units.length} units
                              </span>
                              {mode === "BUILDINGS" && <button type="button" className="btn-secondary" title={`Duplicate ${floor.name}`} onClick={() => duplicateFloor(bi, fi)}><Copy size={14}/> Duplicate floor</button>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
                <div className="mt-10">
                  <h2 className="font-semibold">Unit register</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Showing {Math.min(rows.length, previewPage * 30 + 1)}–
                    {Math.min(rows.length, (previewPage + 1) * 30)} of{" "}
                    {rows.length}. Codes must be unique within a building.
                  </p>
                  <div className="mt-4 space-y-2">
                    {rows
                      .slice(previewPage * 30, previewPage * 30 + 30)
                      .map(({ building, floor, unit, bi, fi, ui }) => (
                        <div
                          key={`${bi}-${fi}-${ui}`}
                          className="grid gap-2 border-b border-border py-3 sm:grid-cols-[minmax(0,1fr)_100px_125px_130px] sm:items-center"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium">
                              {building.name} / {floor.name}
                            </div>
                            <select aria-label={`${unit.code} unit type`} className="mt-2" value={unit.unitType} onChange={(event) => updateUnit(bi, fi, ui, "unitType", event.target.value)}>{types.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select>
                            {unit.unitType === "OTHER" && <input aria-label={`${unit.code} custom unit type`} className="mt-2" required value={unit.unitTypeLabel || ""} onChange={(event) => updateUnit(bi, fi, ui, "unitTypeLabel", event.target.value)} placeholder="Custom type name"/>}
                          </div>
                          <input
                            aria-label={`${building.name} ${floor.name} unit name ${ui + 1}`}
                            value={unit.name}
                            onChange={(event) =>
                              updateUnit(bi, fi, ui, "name", event.target.value)
                            }
                          />
                          <input
                            aria-label={`${building.name} ${floor.name} unit code ${ui + 1}`}
                            value={unit.code}
                            onChange={(event) =>
                              updateUnit(
                                bi,
                                fi,
                                ui,
                                "code",
                                event.target.value.toUpperCase(),
                              )
                            }
                          />
                          <label className="text-xs text-muted-foreground">
                            KES per month
                            <input
                              aria-label={`${unit.code} monthly rent`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={unit.monthlyRent}
                              onChange={(event) =>
                                updateUnit(
                                  bi,
                                  fi,
                                  ui,
                                  "monthlyRent",
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                        </div>
                      ))}
                  </div>
                  {rows.length > 30 && (
                    <div className="mt-5 flex items-center gap-3">
                      <button
                        className="btn-secondary"
                        disabled={previewPage === 0}
                        onClick={() => setPreviewPage((value) => value - 1)}
                      >
                        Previous
                      </button>
                      <span className="text-sm text-muted-foreground">
                        Page {previewPage + 1} of {Math.ceil(rows.length / 30)}
                      </span>
                      <button
                        className="btn-secondary"
                        disabled={(previewPage + 1) * 30 >= rows.length}
                        onClick={() => setPreviewPage((value) => value + 1)}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}
          </motion.div>
          {error && (
            <p
              role="alert"
              className="mt-7 border-l-2 border-red-700 pl-3 text-sm text-red-700 dark:text-red-300"
            >
              {error}
            </p>
          )}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
            <button
              className="btn-secondary"
              disabled={step === 0 || saving}
              onClick={() => {
                setError("");
                setStep((value) => value - 1);
              }}
            >
              <ArrowLeft size={16} /> Back
            </button>
            {step < 3 ? (
              <button className="btn-primary" onClick={next}>
                Continue <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="btn-primary"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Creating property…" : "Confirm and create"}{" "}
                <Check size={16} />
              </button>
            )}
          </div>
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="border-t-2 border-emerald-800 bg-[var(--card)] p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Live blueprint
            </p>
            <h2 className="mt-4 text-xl font-medium">
              {property.name || "Your next property"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {property.address.city || "Location pending"}
            </p>
            <div className="mt-6 space-y-4 border-t border-border pt-5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Structure</span>
                <span>
                  {mode === "STANDALONE"
                    ? "Standalone"
                    : `${buildingNames.length} building${buildingNames.length === 1 ? "" : "s"}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Floor plan</span>
                <span>
                  {mode === "STANDALONE"
                    ? "Ground level"
                    : `${floorCount} per building`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit mix</span>
                <span>
                  {mix.reduce((sum, item) => sum + (item.count || 0), 0)} per
                  floor
                </span>
              </div>
              {step === 3 && (
                <div className="flex justify-between border-t border-border pt-4">
                  <span className="text-muted-foreground">Potential rent</span>
                  <strong className="tabular-nums">
                    {money(summary.estimatedMonthlyRent)}
                  </strong>
                </div>
              )}
            </div>
            <p className="mt-7 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <CircleHelp size={15} className="mt-0.5 shrink-0" /> Existing
              leases keep their agreed rent. These amounts are asking rents for
              new tenancies and vacancy estimates.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
function Eyebrow({ number, title }: { number: string; title: string }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-400">
      {number} / {title}
    </p>
  );
}
function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <div className="text-xl font-medium tabular-nums sm:text-2xl">
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
