import { Router } from "express";
import dataSource from "../data-source.js";
import { SensorReadingSchema } from "../entities/sensor-reading.js";

const router = Router();

router.post("/", async (req, res) => {
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

  const repository = dataSource.getRepository(SensorReadingSchema);
  const reading = await repository.save(
    repository.create({ tdsPpm, temperatureC }),
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
