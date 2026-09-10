import type { IRExpression } from '../../ir';

export type ComputedRuntimeBinding = 'user' | 'context';

/** Only free runtime roots need caller bindings; literals/member names/lambda locals do not. */
export function computedRuntimeBindings(
  expressions: Iterable<IRExpression>,
): ComputedRuntimeBinding[] {
  const found = new Set<ComputedRuntimeBinding>();
  const visit = (expression: IRExpression, locals: ReadonlySet<string>): void => {
    switch (expression.kind) {
      case 'identifier':
        if (
          (expression.name === 'user' || expression.name === 'context') &&
          !locals.has(expression.name)
        ) {
          found.add(expression.name);
        }
        break;
      case 'member':
        visit(expression.object, locals);
        break;
      case 'binary':
        visit(expression.left, locals);
        visit(expression.right, locals);
        break;
      case 'unary':
        visit(expression.operand, locals);
        break;
      case 'conditional':
        visit(expression.condition, locals);
        visit(expression.consequent, locals);
        visit(expression.alternate, locals);
        break;
      case 'array':
        expression.elements.forEach((item) => visit(item, locals));
        break;
      case 'object':
        expression.properties.forEach((item) => visit(item.value, locals));
        break;
      case 'call':
        expression.args.forEach((item) => visit(item, locals));
        break;
      case 'lambda':
        visit(expression.body, new Set([...locals, ...expression.params]));
        break;
    }
  };
  for (const expression of expressions) visit(expression, new Set());
  return ['user', 'context'].filter((name): name is ComputedRuntimeBinding =>
    found.has(name as ComputedRuntimeBinding),
  );
}

/** No default identity/context: callers must provide every runtime root the expression uses. */
export function computedEvaluationParameter(bindings: readonly ComputedRuntimeBinding[]): string {
  return bindings.length
    ? `, { ${bindings.join(', ')} }: { ${bindings.map((name) => `${name}: any`).join('; ')} }`
    : '';
}
