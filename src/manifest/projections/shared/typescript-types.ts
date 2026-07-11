import type { IRType } from '../../ir';

const SCALARS: Readonly<Record<string, string>> = Object.freeze({
  string: 'string',
  text: 'string',
  uuid: 'string',
  email: 'string',
  url: 'string',
  uri: 'string',
  time: 'string',
  number: 'number',
  money: 'number',
  decimal: 'number',
  int: 'number',
  integer: 'number',
  bigint: 'number',
  float: 'number',
  duration: 'number',
  boolean: 'boolean',
  bool: 'boolean',
  date: 'Date',
  datetime: 'Date',
  timestamp: 'number',
  json: 'unknown',
  any: 'unknown',
  bytes: 'Uint8Array',
  void: 'void',
});

export function irTypeToTypeScript(type: IRType, dateAsString = false): string {
  if (type.name === 'array' || type.name === 'list') {
    const inner = type.generic ? irTypeToTypeScript(type.generic, dateAsString) : 'unknown';
    const value = inner.includes(' | ') ? `(${inner})[]` : `${inner}[]`;
    return type.nullable ? `${value} | null` : value;
  }
  const base =
    dateAsString && ['date', 'datetime', 'timestamp'].includes(type.name)
      ? 'string'
      : (SCALARS[type.name] ?? type.name);
  return type.nullable ? `${base} | null` : base;
}
