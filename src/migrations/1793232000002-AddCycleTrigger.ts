import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddCycleTrigger1793232000002 implements MigrationInterface {
  name = "AddCycleTrigger1793232000002";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sensor_readings
      ADD COLUMN trigger_reason varchar(32),
      ADD COLUMN trigger_tds double precision,
      ADD COLUMN trigger_prediction double precision,
      ADD COLUMN trigger_target_start timestamptz,
      ADD COLUMN trigger_target_end timestamptz,
      ADD CONSTRAINT "CHK_sensor_readings_trigger" CHECK (
        (trigger_reason IS NULL AND trigger_tds IS NULL AND trigger_prediction IS NULL
         AND trigger_target_start IS NULL AND trigger_target_end IS NULL)
        OR
        (trigger_reason IS NOT NULL AND trigger_reason IN ('AI_PREDICTION', 'TDS_ACTUAL')
         AND trigger_tds IS NOT NULL AND trigger_tds >= 0 AND trigger_tds < 'Infinity'::float8
         AND (
           (trigger_reason = 'TDS_ACTUAL' AND trigger_prediction IS NULL
            AND trigger_target_start IS NULL AND trigger_target_end IS NULL)
           OR
           (trigger_reason = 'AI_PREDICTION' AND trigger_prediction IS NOT NULL
            AND trigger_prediction >= 0 AND trigger_prediction < 'Infinity'::float8
            AND trigger_target_start IS NOT NULL AND trigger_target_end IS NOT NULL
            AND trigger_target_start < trigger_target_end)
         ))
      )`);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      "This migration is intentionally irreversible to preserve trigger history.",
    );
  }
}
