import { Router } from "express";
import { patientRepository } from "../lib/repositories/patientRepository.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const rows = await patientRepository.listPatientsForUser(req.auth.userId, query);
    return res.json({ data: rows, error: null });
  })
);

router.get(
  "/:patientId",
  asyncHandler(async (req, res) => {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) {
      return res.status(400).json({ data: null, error: { message: "Invalid patient ID" } });
    }
    const row = await patientRepository.getPatientByIdForUser(req.auth.userId, patientId);
    if (!row) {
      return res.status(404).json({ data: null, error: { message: "No rows found" } });
    }
    return res.json({ data: row, error: null });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const ageValue = req.body?.age;
    const ageNumber =
      ageValue === null || ageValue === undefined || ageValue === ""
        ? null
        : Number.isFinite(Number(ageValue))
          ? Number(ageValue)
          : null;

    const payload = {
      patient_id: req.body?.patient_id,
      full_name: req.body?.full_name,
      age: ageNumber,
      gender: req.body?.gender,
      phone: req.body?.phone,
      address: req.body?.address,
      medical_history: req.body?.medical_history,
      allergies: req.body?.allergies,
      diagnosis_history: req.body?.diagnosis_history,
    };

    const row = await patientRepository.upsertPatientForUser(req.auth.userId, payload);
    return res.json({ data: row, error: null });
  })
);

export default router;
