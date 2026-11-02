# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |

## Reporting a vulnerability

Please do not open a public issue for security problems.

Report privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Include the affected endpoint or file, steps to reproduce, and the impact you expect.

You can expect an acknowledgement within a few days and a status update once the report is confirmed or declined. Confirmed issues are fixed in a patch release and credited to the reporter unless you prefer otherwise.

## Scope

Atlo downloads public GitHub repositories and parses them in memory. Reports about the following are especially welcome: zip handling (path traversal, zip bombs), request validation, rate limiting, and anything that could expose files outside an analysed repository.
