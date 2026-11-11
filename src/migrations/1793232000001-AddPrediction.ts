import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddPrediction1793232000001 implements MigrationInterface {
  name = "AddPrediction1793232000001";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sensor_readings
      ADD COLUMN measured_at timestamptz,
      ADD COLUMN cycle_id varchar(128),
      ADD COLUMN pump_state varchar(32),
      ADD CONSTRAINT "CHK_sensor_readings_metadata" CHECK (
        (measured_at IS NULL AND cycle_id IS NULL AND pump_state IS NULL) OR
        (measured_at IS NOT NULL AND cycle_id IS NOT NULL AND length(cycle_id) > 0 AND
         pump_state IS NOT NULL AND pump_state IN ('STANDBY','FILLING','DRAINING','REFILLING','WAIT_TDS_CLEAR','FAULT'))
      )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_sensor_readings_measured_at" ON sensor_readings (measured_at) WHERE measured_at IS NOT NULL',
    );
    await queryRunner.query(`CREATE TABLE prediction_runs (
      target_start timestamptz PRIMARY KEY,
      target_end timestamptz NOT NULL,
      cycle_id varchar(128) NOT NULL,
      predicted_tds double precision,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CHK_prediction_value" CHECK (predicted_tds IS NULL OR (predicted_tds >= 0 AND predicted_tds < 'Infinity'::float8))
    )`);
    await queryRunner.query(
      "ALTER TABLE prediction_runs ENABLE ROW LEVEL SECURITY",
    );
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      "This migration is intentionally irreversible to preserve readings and prediction history.",
    );
  }
}
