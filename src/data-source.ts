import "reflect-metadata";
import "dotenv/config";
import { DataSource } from "typeorm";
import { SensorReadingSchema } from "./entities/sensor-reading.js";
import { CreateSensorReadings1793232000000 } from "./migrations/1793232000000-CreateSensorReadings.js";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is required. Set the Supabase PostgreSQL connection string.",
  );
}

export default new DataSource({
  type: "postgres",
  url,
  ssl: false,
  entities: [SensorReadingSchema],
  migrations: [CreateSensorReadings1793232000000],
  synchronize: false,
  migrationsRun: false,
  installExtensions: false,
  poolSize: 5,
  connectTimeoutMS: 10_000,
});
