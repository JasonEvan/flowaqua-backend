import { EntitySchema } from "typeorm";

export interface SensorReading {
  id: string;
  tdsPpm: number;
  temperatureC: number;
  recordedAt: Date;
  measuredAt: Date | null;
  cycleId: string | null;
  pumpState: string | null;
  triggerReason: "AI_PREDICTION" | "TDS_ACTUAL" | null;
  triggerTds: number | null;
  triggerPrediction: number | null;
  triggerTargetStart: Date | null;
  triggerTargetEnd: Date | null;
}

export const SensorReadingSchema = new EntitySchema<SensorReading>({
  name: "SensorReading",
  tableName: "sensor_readings",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    tdsPpm: { name: "tds_ppm", type: "double precision" },
    temperatureC: { name: "temperature_c", type: "double precision" },
    recordedAt: {
      name: "recorded_at",
      type: "timestamptz",
      createDate: true,
      default: () => "CURRENT_TIMESTAMP",
    },
    measuredAt: { name: "measured_at", type: "timestamptz", nullable: true },
    cycleId: { name: "cycle_id", type: "varchar", length: 128, nullable: true },
    pumpState: {
      name: "pump_state",
      type: "varchar",
      length: 32,
      nullable: true,
    },
    triggerReason: {
      name: "trigger_reason",
      type: "varchar",
      length: 32,
      nullable: true,
    },
    triggerTds: {
      name: "trigger_tds",
      type: "double precision",
      nullable: true,
    },
    triggerPrediction: {
      name: "trigger_prediction",
      type: "double precision",
      nullable: true,
    },
    triggerTargetStart: {
      name: "trigger_target_start",
      type: "timestamptz",
      nullable: true,
    },
    triggerTargetEnd: {
      name: "trigger_target_end",
      type: "timestamptz",
      nullable: true,
    },
  },
  indices: [
    {
      name: "IDX_sensor_readings_recorded_at_id",
      columns: ["recordedAt", "id"],
    },
  ],
  checks: [
    {
      name: "CHK_sensor_readings_tds",
      expression: '"tds_ppm" >= 0 AND "tds_ppm" < \'Infinity\'::float8',
    },
    {
      name: "CHK_sensor_readings_temperature",
      expression:
        '"temperature_c" >= -273.15 AND "temperature_c" < \'Infinity\'::float8',
    },
  ],
});
