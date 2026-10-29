import "dotenv/config";
import app from "./app.js";
import dataSource from "./data-source.js";

const port = Number(process.env.PORT ?? 3000);

try {
  await dataSource.initialize();
  app.listen(port, () => {
    console.log(`FlowAqua API running on port ${port}`);
  });
} catch (error) {
  console.error("Failed to initialize database:", error);
  process.exitCode = 1;
}
