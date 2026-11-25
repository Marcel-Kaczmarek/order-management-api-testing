import Ajv2020, { type ErrorObject } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { allSchemas, type SchemaId } from './index';

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const schema of allSchemas) ajv.addSchema(schema);

export interface SchemaResult {
  valid: boolean;
  errors: string[];
}

function format(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map(
    (e) =>
      `${e.instancePath || '(root)'} ${e.message ?? 'is invalid'}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`,
  );
}

export function validateSchema(schemaId: SchemaId, data: unknown): SchemaResult {
  const validate = ajv.getSchema(schemaId);
  if (!validate) throw new Error(`Unknown schema "${schemaId}"`);
  const valid = validate(data) as boolean;
  return { valid, errors: valid ? [] : format(validate.errors) };
}
