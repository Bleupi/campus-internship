# Security Policy

## Supported versions

This is a demonstration project. Security fixes are applied to the `main` branch only. There are no long-term support branches.

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

If you discover a vulnerability, please report it privately:

- Preferred: use GitHub's **[Private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)** (the "Report a vulnerability" button under the repository's *Security* tab).
- Alternatively: email `<YOUR CONTACT EMAIL>` with a description, reproduction steps, and the impact you observed.

Please allow a reasonable time for a fix before any public disclosure. As a solo-maintained demo, response is best-effort.

## Scope

In scope:

- The application code (`apps/api`, `apps/web`) and shared code (`packages/shared`).
- Authentication, authorization (RBAC), file handling, and data validation.

Out of scope:

- Third-party services (PostgreSQL, S3/MinIO) themselves — report those upstream.
- Denial of service from unrealistic load against a local demo deployment.

## Secrets & sensitive data

This repository is public. The following measures prevent secret leakage:

- **No secret is ever committed.** All secrets live in a local, git-ignored `.env` file. `.env.example` documents the required variables **without values**.
- **Automated secret scanning** runs on every commit and every push via [gitleaks](https://github.com/gitleaks/gitleaks) (see `.gitleaks.toml`). A detected secret **blocks** the commit/push.
- `.gitignore` excludes `.env*` (except `.env.example`), key material, and build artifacts.

If a secret is ever committed by accident, treat it as **compromised**: rotate it immediately (it remains in Git history even after removal) and, if needed, rewrite history with a tool such as `git filter-repo` before the repository is shared.

## Security baseline (application)

The following are enforced in code and reviewed in every change:

- **Input validation** at the boundary with Zod (never trust client input); server-derived fields (e.g. `Stage.semester`) are never accepted from clients.
- **Password storage**: hashed with a modern, salted algorithm (argon2 / bcrypt); never stored or logged in clear text.
- **Authentication & authorization**: RBAC checks on every protected route; the tutor is data, never an authenticatable user.
- **File uploads**: MIME type and size validated against an allow-list; binaries stored in a bucket, never in the database.
- **Least privilege**: database and bucket credentials scoped to what the app needs.
- **No secrets in logs**: error handlers must not leak tokens, credentials, or personal data.
