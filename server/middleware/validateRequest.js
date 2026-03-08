export function validateRequest({ body, query, params } = {}) {
  return (req, res, next) => {
    try {
      if (body) {
        req.validatedBody = body.parse(req.body ?? {});
      }
      if (query) {
        req.validatedQuery = query.parse(req.query ?? {});
      }
      if (params) {
        req.validatedParams = params.parse(req.params ?? {});
      }
      next();
    } catch (error) {
      if (error?.name === "ZodError") {
        return res.status(400).json({
          error: {
            message: "Invalid request input",
            details: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        });
      }
      return next(error);
    }
  };
}
