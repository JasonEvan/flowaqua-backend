import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export const requireDeviceToken: RequestHandler = (req, res, next) => {
  const token = process.env.DEVICE_API_TOKEN;
  if (!token || token === "CHANGE_ME") {
    res.status(503).json({ message: "Device access is not configured." });
    return;
  }
  const provided = req.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(provided);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    res.status(401).json({ message: "Unauthorized." });
    return;
  }
  next();
};
