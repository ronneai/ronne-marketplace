# Checklist

- [ ] Queries use parameters, never string concatenation.
- [ ] Shell commands take arguments as arrays, not one interpolated string.
- [ ] Input is validated at the boundary (zod or similar).
- [ ] No secrets in the diff.
- [ ] Every mutation checks the caller's permissions.
