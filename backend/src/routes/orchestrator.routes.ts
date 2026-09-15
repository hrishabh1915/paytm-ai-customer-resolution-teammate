import { Router } from "express";
import {
  executeSessionStep,
  runSession,
  submitHumanVerdict,
  getSessionStatus,
} from "../controllers/orchestrator.controller";

const router = Router();

router.post("/sessions/:sessionId/step", executeSessionStep);
router.post("/sessions/:sessionId/run", runSession);
router.get("/sessions/:sessionId", getSessionStatus);
router.get("/sessions/:sessionId/status", getSessionStatus);
router.post("/reviews/:reviewId/verdict", submitHumanVerdict);

export default router;
