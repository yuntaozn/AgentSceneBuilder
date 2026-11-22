# Security Policy

AgentSceneBuilder is currently a local-first open source project. It does not require accounts, cloud services, or a long-running local service for the core Skill + CLI route.

## Reporting a vulnerability

Until a public security contact is created, please open a private disclosure through the eventual GitHub repository security advisory flow if available. If that is not available yet, open a minimal public issue that describes the affected area without publishing exploit details.

## Security boundaries

- The CLI should write one JSON object to stdout and avoid hidden side effects.
- Registry and model-library entries must not require network access to build.
- Plugin packaging must not declare MCP servers or long-running services on the current product route.
- Avoid committing secrets, tokens, proprietary project files, or generated private assets.

## Supported versions

Before the first public release, only the latest main branch is considered supported.
