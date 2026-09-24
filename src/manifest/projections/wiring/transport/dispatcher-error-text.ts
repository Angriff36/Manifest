/**
 * Convex HTTP actions wrap a thrown message before it reaches the caller.
 * The thrown line is what failure rules are written against.
 */

/** Pulls the thrown line out of a Convex error wrapper. */
export class DispatcherErrorText {
  static thrownLine(raw: string): string {
    const uncaught = raw.match(
      /Uncaught (?:DOMException|OperationError|Error):\s*([^\r\n]+)/i,
    )?.[1];
    const argumentValidation = raw.match(/ArgumentValidationError:\s*([^\r\n]+)/i)?.[1];
    const schemaValidation = raw.match(
      /(?:DocumentDoesNotMatchSchema|does not match the schema):\s*([^\r\n]+)/i,
    )?.[1];
    const candidate = uncaught ?? argumentValidation ?? schemaValidation ?? raw;
    return candidate
      .replace(/^\[CONVEX [^\]]+\]\s*/, '')
      .replace(/\[Request ID:\s*[^\]]+\]\s*/gi, '')
      .replace(/^Server Error:?\s*/i, '')
      .replace(/^Uncaught (?:DOMException|OperationError|Error):\s*/i, '')
      .replace(/^Error:\s*/i, '')
      .replace(/\s*Called by client\s*$/i, '')
      .trim();
  }
}
