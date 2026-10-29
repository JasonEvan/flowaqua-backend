import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSensorReadings1793232000000 implements MigrationInterface {
  name = "CreateSensorReadings1793232000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sensor_readings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tds_ppm" double precision NOT NULL,
        "temperature_c" double precision NOT NULL,
        "recorded_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_sensor_readings" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_sensor_readings_tds" CHECK (
          "tds_ppm" >= 0 AND "tds_ppm" < 'Infinity'::float8
        ),
        CONSTRAINT "CHK_sensor_readings_temperature" CHECK (
          "temperature_c" >= -273.15 AND "temperature_c" < 'Infinity'::float8
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_sensor_readings_recorded_at_id"
      ON "sensor_readings" ("recorded_at", "id")
    `);
    // No public Data API access; the backend uses the database owner connection.
    await queryRunner.query(
      'ALTER TABLE "sensor_readings" ENABLE ROW LEVEL SECURITY',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "sensor_readings"');
  }
}
