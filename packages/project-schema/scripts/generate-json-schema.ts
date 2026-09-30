import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { ProjectSchema } from '../src/project.js';
import { OperationSchema } from '../src/operations.js';

const out = resolve(import.meta.dirname, '../../../schemas');
mkdirSync(out, { recursive: true });
const write = (name: string, schema: z.ZodType) =>
  writeFileSync(resolve(out, name), JSON.stringify(z.toJSONSchema(schema, { unrepresentable: 'any' }), null, 2) + '\n');
write('project.json', ProjectSchema);
write('operations.json', OperationSchema);
console.log('wrote schemas/project.json and schemas/operations.json');
