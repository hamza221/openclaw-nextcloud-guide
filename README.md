# OpenClaw for Nextcloud development

A static, step-by-step tutorial for a Debian VPS, OpenClaw, a private Nextcloud development environment, GitHub work, Talk, and browser testing.

Read the published guide at https://hamza221.github.io/openclaw-nextcloud-guide/ or open index.html locally. The page has no external fonts, analytics, or JavaScript dependencies.

## Scope

This guide excludes production Nextcloud and AIO installation. It uses nextcloud/nextcloud-docker-dev and links to the app documentation for builds and tests.

The source walkthrough used OpenClaw 2026.9.4 on Debian 13. The guide was reviewed against upstream documentation on 2026-09-17. The revised recipe has not been executed end to end on a clean VPS. Moving upstream defaults remain moving; record source revisions and image digests for your deployment.

## Files

- index.html: tutorial, readable without JavaScript.
- assets/: local styling and copy-button code.
- examples/: Dockerfile and Compose overlays referenced by the guide.
- templates/: reusable development workflow instructions.

The custom GitHub poller and development helper scripts mentioned in the original chat exports were not supplied. They are not bundled or presented as installable upstream tools. The guide includes a setup prompt and acceptance checks for the poller.

## Preview

Run `python3 -m http.server 8000` in this directory, then open http://127.0.0.1:8000.

## Publishing

GitHub Pages serves the repository root from the main branch. No build or workflow file is required. Keep .nojekyll in place.

## Privacy

Do not add chat exports, .env files, OAuth tokens, passwords, private keys, or real deployment details. Examples use placeholder domains and the documentation-only IP 203.0.113.10.
