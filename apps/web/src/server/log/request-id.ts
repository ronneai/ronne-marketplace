/** What a request ID may be (100): at most 128 characters of `[A-Za-z0-9._-]`. */
const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Whether a value could be a request ID: an incoming header (100), the audit log's filter (166). */
export const isRequestId = (value: string): boolean => REQUEST_ID.test(value);
