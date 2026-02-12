export function toValidationError(err) {
    return {
        path: err.instancePath || "/",
        message: err.message ?? "Unknown validation error",
        keyword: err.keyword,
        params: err.params,
    };
}
//# sourceMappingURL=types.js.map