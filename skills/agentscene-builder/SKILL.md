---
name: agentscene-builder
description: Give LLM-powered Agents structured tools to find, build, inspect, and validate renderer-neutral 3D models. Use when Codex needs CompositionSpec, reusable geometry, semantic components, dimensions, paths, repetition, alignment, attachments, or machine-readable CLI diagnostics for engineering, teaching, and equipment scenes.
---

# AgentSceneBuilder Plugin Skill

Read the repository-root `../../SKILL.md` completely before acting. It is the authoritative AgentSceneBuilder skill contract.

This wrapper exists so a Codex plugin can discover the project as a normal plugin skill while the repository root remains usable as a standalone skill during local development.

Do not add MCP or a long-running local service. Use the Skill + CLI route described in the root `SKILL.md`.
