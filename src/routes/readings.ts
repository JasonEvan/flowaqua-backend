import { Router } from "express";
import dataSource from "../data-source.js";
import { SensorReadingSchema } from "../entities/sensor-reading.js";
import { requireDeviceToken } from "../device-auth.js";

const router = Router();
function parseUtc(value: unknown): Date | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  )
    return null;
  const date = new Date(value);
  const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
  return Number.isFinite(date.getTime()) && date.toISOString() === canonical
    ? date
    : null;
}

router.post("/", requireDeviceToken, async (req, res) => {
  const body: unknown = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    res.status(400).json({ message: "Body must be a JSON object." });
    return;
  }

  const { tdsPpm, temperatureC } = body as Record<string, unknown>;
  if (typeof tdsPpm !== "number" || !Number.isFinite(tdsPpm) || tdsPpm < 0) {
    res.status(400).json({ message: "tdsPpm must be a finite number >= 0." });
    return;
  }
  if (
    typeof temperatureC !== "number" ||
    !Number.isFinite(temperatureC) ||
    temperatureC < -273.15
  ) {
    res
      .status(400)
      .json({ message: "temperatureC must be a finite number >= -273.15." });
    return;
  }
  const { measuredAt, cycleId, pumpState } = body as Record<string, unknown>;
  const legacy =
    measuredAt === undefined &&
    cycleId === undefined &&
    pumpState === undefined;
  let measurementTime: Date | null = null;
  if (!legacy) {
    if (
      typeof measuredAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(measuredAt)
    ) {
      res
        .status(400)
        .json({ message: "measuredAt must be an ISO UTC timestamp." });
      return;
    }
    measurementTime = new Date(measuredAt);
    const canonical = measuredAt.includes(".")
      ? measuredAt
      : measuredAt.replace("Z", ".000Z");
    const age = Date.now() - measurementTime.getTime();
    if (
      !Number.isFinite(age) ||
      measurementTime.toISOString() !== canonical ||
      age < -30_000 ||
      age > 120_000
    ) {
      res
        .status(400)
        .json({ message: "measuredAt must be a valid, recent UTC timestamp." });
      return;
    }
    if (
      typeof cycleId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(cycleId) ||
      typeof pumpState !== "string" ||
      ![
        "STANDBY",
        "FILLING",
        "DRAINING",
        "REFILLING",
        "WAIT_TDS_CLEAR",
        "FAULT",
      ].includes(pumpState)
    ) {
      res.status(400).json({ message: "Invalid cycleId or pumpState." });
      return;
    }
  }
  const fields = body as Record<string, unknown>;
  const triggerReason = fields.triggerReason ?? null;
  const triggerTds = fields.triggerTds ?? null;
  const triggerPrediction = fields.triggerPrediction ?? null;
  const rawStart = fields.triggerTargetStart ?? null;
  const rawEnd = fields.triggerTargetEnd ?? null;
  let triggerTargetStart: Date | null = null;
  let triggerTargetEnd: Date | null = null;
  if (triggerReason === null) {
    if (
      triggerTds !== null ||
      triggerPrediction !== null ||
      rawStart !== null ||
      rawEnd !== null
    ) {
      res
        .status(400)
        .json({ message: "Trigger values require triggerReason." });
      return;
    }
  } else {
    if (
      (triggerReason !== "AI_PREDICTION" && triggerReason !== "TDS_ACTUAL") ||
      typeof triggerTds !== "number" ||
      !Number.isFinite(triggerTds) ||
      triggerTds < 0
    ) {
      res.status(400).json({ message: "Invalid triggerReason or triggerTds." });
      return;
    }
    if (triggerReason === "TDS_ACTUAL") {
      if (triggerPrediction !== null || rawStart !== null || rawEnd !== null) {
        res
          .status(400)
          .json({ message: "TDS_ACTUAL cannot include prediction details." });
        return;
      }
    } else {
      triggerTargetStart = parseUtc(rawStart);
      triggerTargetEnd = parseUtc(rawEnd);
      if (
        typeof triggerPrediction !== "number" ||
        !Number.isFinite(triggerPrediction) ||
        triggerPrediction < 0 ||
        !triggerTargetStart ||
        !triggerTargetEnd ||
        triggerTargetStart >= triggerTargetEnd
      ) {
        res
          .status(400)
          .json({
            message:
              "AI_PREDICTION requires a valid prediction and ordered UTC target window.",
          });
        return;
      }
    }
  }

  const repository = dataSource.getRepository(SensorReadingSchema);
  const reading = await repository.save(
    repository.create({
      tdsPpm,
      temperatureC,
      measuredAt: measurementTime,
      cycleId: legacy ? null : (cycleId as string),
      pumpState: legacy ? null : (pumpState as string),
      triggerReason: triggerReason as "AI_PREDICTION" | "TDS_ACTUAL" | null,
      triggerTds: triggerTds as number | null,
      triggerPrediction: triggerPrediction as number | null,
      triggerTargetStart,
      triggerTargetEnd,
    }),
  );
  res.status(201).json(reading);
});

router.get("/", async (req, res) => {
  const rawLimit = req.query.limit;
  if (
    rawLimit !== undefined &&
    (typeof rawLimit !== "string" || !/^[1-9]\d{0,3}$/.test(rawLimit))
  ) {
    res
      .status(400)
      .json({ message: "limit must be an integer between 1 and 1000." });
    return;
  }
  const limit = rawLimit === undefined ? 100 : Number(rawLimit);
  if (limit > 1000) {
    res
      .status(400)
      .json({ message: "limit must be an integer between 1 and 1000." });
    return;
  }

  const readings = await dataSource.getRepository(SensorReadingSchema).find({
    order: { recordedAt: "DESC", id: "DESC" },
    take: limit,
  });
  res.json(readings);
});

export default router;
