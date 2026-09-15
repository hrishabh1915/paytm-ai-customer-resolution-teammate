import { Router } from "express";
import { intakeTicket } from "../controllers/ticket.controller";

const router = Router();

router.post("/tickets/intake", intakeTicket);

export default router;
