import express from "express";
import type { ErrorRequestHandler } from "express";
import readingsRouter from "./routes/readings.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "FlowAqua API" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/readings", readingsRouter);

app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next,
) => {
  if (
    error instanceof SyntaxError &&
    "type" in error &&
    error.type === "entity.parse.failed"
  ) {
    res.status(400).json({ message: "Invalid JSON body." });
    return;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    res.status(413).json({ message: "Request body too large." });
    return;
  }
  console.error("Request failed:", error);
  res.status(500).json({ message: "Internal server error." });
};

app.use(errorHandler);

export default app;
