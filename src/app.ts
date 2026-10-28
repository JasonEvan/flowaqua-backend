import express from "express";

const app = express();

app.disable("x-powered-by");
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "FlowAqua API" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

export default app;
