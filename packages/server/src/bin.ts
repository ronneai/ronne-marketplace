#!/usr/bin/env node
import { main } from "./run.js";

const code = await main(process.argv.slice(2));
if (code !== undefined) process.exitCode = code;
