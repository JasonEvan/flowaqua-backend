import dataSource from "./data-source.js";

const HOUR = 3_600_000;
const MAX_GAP = 300_000;
const START_DEADLINE = 300_000;
const MODEL_TIMEOUT = 15_000;
const MODEL_URL = process.env.MODEL_URL || "https://ml.aqua.flow-app.my.id/predict";

interface Reading {
  measured_at: Date;
  cycle_id: string;
  pump_state: string;
  temperature_c: number;
  tds_ppm: number;
}

async function runForCurrentHour(): Promise<void> {
  const now = Date.now();
  const start = Math.floor(now / HOUR) * HOUR;
  if (now - start > START_DEADLINE) return;

  const rows: Reading[] = await dataSource.query(
    `SELECT measured_at, cycle_id, pump_state, temperature_c, tds_ppm
     FROM sensor_readings WHERE measured_at >= $1 AND measured_at < $2
       AND cycle_id IS NOT NULL AND pump_state IS NOT NULL
     ORDER BY measured_at ASC, recorded_at ASC, id ASC`,
    [new Date(start - 4 * HOUR), new Date(start)],
  );
  if (!rows.length) return;
  const cycle = rows[rows.length - 1]!.cycle_id;
  const buckets: { temperature: number; tds: number }[] = [];
  for (let hour = 0; hour < 4; hour++) {
    const left = start - (4 - hour) * HOUR;
    const right = left + HOUR;
    const readings = rows.filter((row) => {
      const time = new Date(row.measured_at).getTime();
      return time >= left && time < right;
    });
    let last = left;
    let count = 0;
    let temperature = 0;
    let tds = 0;
    for (const reading of readings) {
      const time = new Date(reading.measured_at).getTime();
      if (
        reading.cycle_id !== cycle ||
        reading.pump_state !== "STANDBY" ||
        !Number.isFinite(reading.temperature_c) ||
        reading.temperature_c < 0 ||
        reading.temperature_c > 55 ||
        !Number.isFinite(reading.tds_ppm) ||
        reading.tds_ppm < 0 ||
        reading.tds_ppm > 2000 ||
        time - last > MAX_GAP
      )
        return;
      // Multiple arrivals for one measurement are not independent coverage.
      if (count && time === last) continue;
      last = time;
      count++;
      temperature += reading.temperature_c;
      tds += reading.tds_ppm;
    }
    if (count < 120 || right - last > MAX_GAP) return;
    buckets.push({ temperature: temperature / count, tds: tds / count });
  }

  // Reservation survives crashes and is shared by all server instances. Never retry
  // a reserved hour: the remote request may have completed before a crash.
  if (Date.now() - start > START_DEADLINE) return;
  const reserved: { target_start: Date }[] = await dataSource.query(
    `INSERT INTO prediction_runs (target_start, target_end, cycle_id)
     VALUES ($1, $2, $3) ON CONFLICT (target_start) DO NOTHING RETURNING target_start`,
    [new Date(start), new Date(start + HOUR), cycle],
  );
  if (!reserved.length || Date.now() - start > START_DEADLINE) return;
  const features: Record<string, number> = {};
  for (let lag = 0; lag < 4; lag++) {
    const bucket = buckets[3 - lag]!;
    const suffix = lag === 0 ? "sekarang" : `${lag}_jam_lalu`;
    features[`suhu_${suffix}`] = bucket.temperature;
    features[`tds_${suffix}`] = bucket.tds;
  }
  try {
    const response = await fetch(MODEL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(features),
      signal: AbortSignal.timeout(MODEL_TIMEOUT),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`Model returned HTTP ${response.status}`);
    const body: unknown = await response.json();
    const value =
      typeof body === "object" && body !== null && "prediksi_tds" in body
        ? body.prediksi_tds
        : undefined;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 2000 ||
      Date.now() >= start + HOUR
    )
      throw new Error("Invalid or expired model prediction");
    await dataSource.query(
      "UPDATE prediction_runs SET predicted_tds = $2 WHERE target_start = $1",
      [new Date(start), value],
    );
  } catch (error) {
    console.error("Prediction failed:", error);
  }
}

export function startPredictionScheduler(): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runForCurrentHour();
    } catch (error) {
      console.error("Prediction scheduler failed:", error);
    } finally {
      running = false;
    }
  };
  void tick();
  setInterval(() => {
    void tick();
  }, 60_000).unref();
}

export async function latestPrediction(): Promise<object> {
  const rows: {
    predicted_tds: number;
    target_start: Date;
    target_end: Date;
    cycle_id: string;
  }[] = await dataSource.query(
    `SELECT p.predicted_tds, p.target_start, p.target_end, p.cycle_id
     FROM prediction_runs p
     JOIN LATERAL (
       SELECT cycle_id, pump_state, measured_at FROM sensor_readings
       WHERE measured_at IS NOT NULL AND cycle_id IS NOT NULL AND pump_state IS NOT NULL
       ORDER BY recorded_at DESC, id DESC LIMIT 1
     ) r ON r.cycle_id = p.cycle_id AND r.pump_state = 'STANDBY'
       AND NOT EXISTS (
         SELECT 1 FROM sensor_readings event
         WHERE event.recorded_at >= p.target_start AND event.measured_at IS NOT NULL
           AND (event.cycle_id <> p.cycle_id OR event.pump_state <> 'STANDBY')
       )
       AND NOT EXISTS (
         SELECT 1 FROM (
           SELECT measured_at, lag(measured_at, 1, p.target_start)
             OVER (ORDER BY measured_at, recorded_at, id) AS previous_at
           FROM sensor_readings
           WHERE measured_at >= p.target_start AND measured_at <= CURRENT_TIMESTAMP
             AND cycle_id IS NOT NULL AND pump_state IS NOT NULL
         ) samples WHERE samples.measured_at - samples.previous_at > interval '2 minutes'
       )
     WHERE p.target_start <= CURRENT_TIMESTAMP AND p.target_end > CURRENT_TIMESTAMP
       AND p.predicted_tds IS NOT NULL
       AND r.measured_at >= CURRENT_TIMESTAMP - interval '2 minutes'
       AND r.measured_at <= CURRENT_TIMESTAMP + interval '30 seconds'
     ORDER BY p.target_start DESC LIMIT 1`,
  );
  const prediction = rows[0];
  if (!prediction) return { status: "unavailable" };
  return {
    status: "available",
    predictedTds: prediction.predicted_tds,
    targetStart: prediction.target_start,
    targetEnd: prediction.target_end,
    cycleId: prediction.cycle_id,
  };
}

export async function predictionHistory(): Promise<object[]> {
  const rows: {
    predicted_tds: number;
    target_start: Date;
    target_end: Date;
    cycle_id: string;
  }[] = await dataSource.query(
    `SELECT predicted_tds, target_start, target_end, cycle_id
     FROM prediction_runs
     WHERE predicted_tds IS NOT NULL
     ORDER BY target_start DESC
     LIMIT 100`,
  );
  return rows.map((prediction) => ({
    predictedTds: prediction.predicted_tds,
    targetStart: prediction.target_start,
    targetEnd: prediction.target_end,
    cycleId: prediction.cycle_id,
  }));
}
