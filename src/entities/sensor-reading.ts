import { EntitySchema } from "typeorm";

export interface SensorReading {
  id: string;
  tdsPpm: number;
  temperatureC: number;
  recordedAt: Date;
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
