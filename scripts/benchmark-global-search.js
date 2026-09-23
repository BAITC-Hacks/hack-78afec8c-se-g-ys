#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const simulationPath = path.join(projectRoot, 'src', 'simulation.js');
const program = `
  const { findGlobalOptimum } = require(${JSON.stringify(simulationPath)});
  const started = process.hrtime.bigint();
  const result = findGlobalOptimum();
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  process.stdout.write(JSON.stringify({ elapsedMs, validScenarioCount: result.validScenarioCount }));
`;

const cold = JSON.parse(execFileSync(process.execPath, ['-e', program], { encoding: 'utf8' }));
const { findGlobalOptimum } = require('../src/simulation');
findGlobalOptimum();
const warmStarted = process.hrtime.bigint();
const warm = findGlobalOptimum();
const warmElapsedMs = Number(process.hrtime.bigint() - warmStarted) / 1e6;

console.log(JSON.stringify({
  catalogue: 'qala-catalog-v1',
  model: 'qala-score-q8-v1',
  validScenarioCount: cold.validScenarioCount,
  coldMs: Number(cold.elapsedMs.toFixed(2)),
  warmMs: Number(warmElapsedMs.toFixed(2)),
  representativeScore: warm.score,
}, null, 2));
