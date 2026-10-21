import { Input, Select } from "../ui";
import type { UnitCondition } from "../../db/phoneUnits";

export interface UnitDetailDraft {
  condition: UnitCondition;
  color: string;
  capacity: string;
  battery: string;
}

export const EMPTY_UNIT_DETAILS: UnitDetailDraft = {
  condition: "nuevo",
  color: "",
  capacity: "",
  battery: "",
};

export function parseBattery(raw: string): number | null {
  const n = Number(raw.replace(",", "."));
  if (!raw.trim() || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export default function UnitDetailFields({
  value,
  onChange,
  conditions = ["nuevo", "usado", "reacondicionado"],
}: {
  value: UnitDetailDraft;
  onChange: (next: UnitDetailDraft) => void;
  conditions?: UnitCondition[];
}) {
  const set = <K extends keyof UnitDetailDraft>(k: K, v: UnitDetailDraft[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
      <Select
        label="Condición"
        value={value.condition}
        onChange={(e) => set("condition", e.target.value as UnitCondition)}
      >
        {conditions.map((c) => (
          <option key={c} value={c}>
            {c === "nuevo" ? "Nuevo" : c === "usado" ? "Usado" : "Reacondicionado"}
          </option>
        ))}
      </Select>
      <Input label="Color" value={value.color} onChange={(e) => set("color", e.target.value)} placeholder="Opcional" />
      <Input
        label="Capacidad"
        value={value.capacity}
        onChange={(e) => set("capacity", e.target.value)}
        placeholder="Ej. 128 GB"
      />
      <Input
        label="Batería %"
        type="number"
        min={0}
        max={100}
        value={value.battery}
        onChange={(e) => set("battery", e.target.value)}
        placeholder={value.condition === "nuevo" ? "—" : "Ej. 87"}
        disabled={value.condition === "nuevo"}
      />
    </div>
  );
}
