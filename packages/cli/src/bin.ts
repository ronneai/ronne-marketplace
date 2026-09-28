#!/usr/bin/env node
import { run } from "./cli.js";
import { defaultIo } from "./io.js";

const result = await run(process.argv.slice(2), defaultIo());
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
