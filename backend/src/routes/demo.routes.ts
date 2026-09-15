import { Router } from "express";
import { getDemoScenarios, seedDemoScenario } from "../controllers/demo.controller";

const router = Router();

router.get("/demo/scenarios", getDemoScenarios);
router.post("/demo/seed-scenario", seedDemoScenario);

export default router;
