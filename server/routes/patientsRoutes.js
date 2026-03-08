import { Router } from "express";
import { patientRepository } from "../lib/repositories/patientRepository.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { auditLogService } from "../services/auditLogService.js";
import {
  listPatientsQuerySchema,
  patientIdParamSchema,
  upsertPatientSchema,
} from "../validators/patientValidators.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  validateRequest({ query: listPatientsQuerySchema }),
  asyncHandler(async (req, res) => {
    const { q: query } = req.validatedQuery;
    const rows = await patientRepository.listPatientsForUser(req.auth.userId, query);
    return res.json({ data: rows, error: null });
  })
);

router.get(
  "/:patientId",
  validateRequest({ params: patientIdParamSchema }),
  asyncHandler(async (req, res) => {
    const { patientId } = req.validatedParams;
    const row = await patientRepository.getPatientByIdForUser(req.auth.userId, patientId);
    if (!row) {
      return res.status(404).json({ data: null, error: { message: "No rows found" } });
    }
    await auditLogService.log(req, {
      action: "view_patient_record",
      resourceType: "patient",
      resourceId: patientId,
    });
    return res.json({ data: row, error: null });
  })
);

router.post(
  "/",
  validateRequest({ body: upsertPatientSchema }),
  asyncHandler(async (req, res) => {
    const row = await patientRepository.upsertPatientForUser(req.auth.userId, req.validatedBody);
    await auditLogService.log(req, {
      action: "upsert_patient_record",
      resourceType: "patient",
      resourceId: row.patient_id,
    });
    return res.json({ data: row, error: null });
  })
);

export default router;
