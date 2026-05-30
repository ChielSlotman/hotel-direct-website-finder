import { readFileSync } from 'node:fs';

const files = [
  'package.json',
  '.actor/actor.json',
  '.actor/input_schema.json',
  '.actor/dataset_schema.json',
  '.actor/output_schema.json',
  'examples/input.json',
  'examples/local-smoke-input.json',
  'examples/output.json'
];

for (const file of files) {
  JSON.parse(readFileSync(file, 'utf8'));
}

console.log(`Validated ${files.length} JSON files.`);
