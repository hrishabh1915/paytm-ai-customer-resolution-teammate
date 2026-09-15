import express, { Application } from "express";
import cors from "cors";
import routes from "./routes";
import { notFoundHandler } from "./middleware/notFoundHandler";
import { errorHandler } from "./middleware/errorHandler";

export const createApp = (): Application => {
  const app = express();

  // Core Middleware
  const allowedOrigin = process.env.CORS_ORIGIN;
  app.use(
    cors({
      origin: allowedOrigin ? allowedOrigin.split(",").map((o) => o.trim()) : true,
      credentials: true,
    })
  );
  app.use(express.json());

  // Application Routes
  app.use(routes);

  // 404 & Error Handling Middleware
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
