#!/usr/bin/env node
// Shim: forwards to the compiled CLI entry point.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "..", "dist", "main.js");
const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
