#!/usr/bin/env node
import { run } from "../packages/cli/src/agentscene.mjs";

process.exitCode = run(process.argv.slice(2));
