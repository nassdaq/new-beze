import { SCHEMA_VERSION } from '@beze/project-schema';

/** Keep in sync with packages/runtime/package.json. Exports pin this in runtime/VERSION. */
export const RUNTIME_VERSION = '0.1.0';
export const SUPPORTED_SCHEMA = { min: 1, max: SCHEMA_VERSION } as const;
