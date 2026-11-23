---
name: secure-coding
description: Checks code for common security mistakes such as injection, unsafe deserialisation and leaked secrets. Use when writing or reviewing code that handles input, auth or secrets.
---

# Secure coding

When writing or reviewing code, check for:

1. **Injection.** User input reaching SQL, shell commands or HTML without parameterisation or escaping.
2. **Secrets.** API keys, tokens or passwords in source, logs or error messages.
3. **Auth.** Missing authorization checks on server actions and API routes.
4. **Deserialisation.** Parsing untrusted data into objects without validation.

See [checklist.md](checklist.md) for the full list.
