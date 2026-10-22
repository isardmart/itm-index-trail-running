# Security policy

## Supported versions

Only the latest release of `@isardtrail/itm` receives security fixes.

## Reporting a vulnerability

**Please do not open a public issue.** Report it privately through GitHub:
[Security → Report a vulnerability](https://github.com/isardmart/itm-index-trail-running/security/advisories/new).

Include what is affected, how to reproduce it and, if you can, a suggested fix. You will get an answer within 7 days;
once a fix is released, the advisory is published with credit to you (unless you prefer otherwise).

## Scope

The package is pure computation: no I/O, no network and no runtime dependencies. Relevant reports include, for
example:

- input that makes the engine hang, crash or use unbounded memory (activities, configs, athlete profiles, modifiers);
- a way for a modifier to bypass the core's guards (clamping, causality, declared inputs, the body-mass rule);
- a problem in the published build or in how the package is installed from GitHub.

Wrong ITM values or readiness results are bugs, not vulnerabilities: please use a normal issue for those.
