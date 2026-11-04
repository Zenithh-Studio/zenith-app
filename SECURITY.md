# Security Policy

## Supported versions

Security fixes are made on the default branch. Use the latest published deployment or release when possible.

## Reporting a vulnerability

Please do not disclose suspected vulnerabilities in a public issue or discussion. Use the repository host's private vulnerability reporting feature. If that feature is unavailable, contact a project maintainer through a private channel before sharing technical details.

Include the affected version or commit, impact, reproduction steps, and any suggested mitigation. Do not include real credentials, personal data, or production customer content in a report.

Maintainers will acknowledge reports, investigate them, coordinate a fix, and decide on disclosure timing with the reporter. Response timing depends on severity and maintainer availability.

## Deployment notes

Provider keys must stay in server-only environment variables. Payload/Figma platform configuration is managed by the Make runtime and must not be copied into source control, client bundles, or issue reports.
