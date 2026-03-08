export class MedicalProcessingError extends Error {
  constructor(message, { code = "MEDICAL_PROCESSING_ERROR", statusCode = 500, details = null } = {}) {
    super(message);
    this.name = "MedicalProcessingError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function formatMedicalError(error, fallbackMessage = "Medical audio processing failed") {
  if (error instanceof MedicalProcessingError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details ?? null,
    };
  }

  const message =
    typeof error?.message === "string" && error.message.trim() ? error.message.trim() : fallbackMessage;

  return {
    code: "MEDICAL_PROCESSING_ERROR",
    message,
    details: null,
  };
}
