import { Router } from "express";
import healthRoutes from "./health.routes";
import ticketRoutes from "./ticket.routes";
import orchestratorRoutes from "./orchestrator.routes";
import demoRoutes from "./demo.routes";

const router = Router();

// Base routes
router.use("/", healthRoutes);

// API v1 routes
router.use("/api/v1", ticketRoutes);
router.use("/api/v1", orchestratorRoutes);
router.use("/api/v1", demoRoutes);

export default router;

