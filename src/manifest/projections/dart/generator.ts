/**
 * Dart/Flutter projection for Manifest IR.
 *
 * Generates type-safe Dart model classes with `fromJson`/`toJson` methods
 * and Riverpod or Provider state management hooks from IR entities and commands.
 * Produces a Dart package consumable by Flutter apps.
 *
 * Surfaces:
 *   - dart.entity      → Single entity model class
 *   - dart.command     → Command params/return models
 *   - dart.models      → All entity + command models in one file
 *   - dart.client      → Dio-based async HTTP client SDK
 *   - dart.providers   → Riverpod/Provider state management hooks
 *   - dart.package     → Complete package (models + client + providers + pubspec)
 *
 * Reuses constraint analysis from `src/manifest/constraint-analysis.ts`
 * for validator method generation.
 */

import type { IR, IREntity, IRCommand, IRType, IREnum } from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionDiagnostic,
  ProjectionArtifact,
} from '../interface';
import type { DartProjectionOptions, DartStateManagement } from './types';
import {
  analyzeConstraints,
  numericRangeToZodChain,
  lengthConstraintToZodChain,
  patternConstraintToZodChain,
} from '../../constraint-analysis.js';

// ============================================================================
// Type mapping
// ============================================================================

/** IR type name → Dart type. Generic types are handled separately. */
const TYPE_MAP: Record<string, string> = {
  string: 'String',
  text: 'String',
  boolean: 'bool',
  bool: 'bool',
  number: 'double',
  float: 'double',
  decimal: 'String',
  money: 'String',
  int: 'int',
  integer: 'int',
  bigint: 'int',
  date: 'DateTime',
  datetime: 'DateTime',
  timestamp: 'DateTime',
  uuid: 'String',
  email: 'String',
  url: 'String',
  uri: 'String',
  json: 'dynamic',
  any: 'dynamic',
  bytes: 'Uint8List',
  object: 'Map<String, dynamic>',
};

// ============================================================================
// Helpers
// ============================================================================

/** Convert an IRType to a Dart type annotation string. */
function irTypeToDart(type: IRType, diagnostics: ProjectionDiagnostic[]): string {
  // Handle generic types first (array, map) before TYPE_MAP lookup
  if (type.name === 'array' && type.generic) {
    const inner = irTypeToDart(type.generic, diagnostics);
    return `List<${inner}>`;
  }

  if (type.name === 'map' && type.generic) {
    const inner = irTypeToDart(type.generic, diagnostics);
    return `Map<String, ${inner}>`;
  }

  const base = TYPE_MAP[type.name];
  if (base === undefined) {
    diagnostics.push({
      severity: 'warning',
      code: 'DART_UNKNOWN_TYPE',
      message: `Unknown IR type "${type.name}", falling back to dynamic`,
    });
    return 'dynamic';
  }

  return base;
}

/** Convert snake_case or camelCase to PascalCase. */
function pascalCase(name: string): string {
  return name
    .replace(/[_]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

/** Convert PascalCase or snake_case to camelCase. */
function camelCase(name: string): string {
  const pascal = pascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** Convert PascalCase to snake_case for file paths. */
function snakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

// ============================================================================
// Entity model generation
// ============================================================================

interface EntityModelResult {
  lines: string[];
  entityName: string;
  hasComputed: boolean;
  hasConstraints: boolean;
}

function generateEntityModel(
  entity: IREntity,
  opts: ReturnType<typeof normalizeOptions>,
  diagnostics: ProjectionDiagnostic[],
): EntityModelResult {
  const name = pascalCase(entity.name);
  const lines: string[] = [];
  const hasComputed = entity.computedProperties.length > 0;

  // Analyze constraints for this entity
  const analysis = analyzeConstraints(entity.constraints);

  // Build lookup: property name → numeric range chain
  const numericChains = new Map<string, string>();
  for (const range of analysis.numericRanges) {
    const prop = range.propertyPath.replace(/^self\./, '');
    numericChains.set(prop, numericRangeToZodChain(range));
  }

  // Build lookup: property name → length chain
  const lengthChains = new Map<string, string>();
  for (const lc of analysis.lengthConstraints) {
    const prop = lc.propertyPath.replace(/^self\./, '');
    lengthChains.set(prop, lengthConstraintToZodChain(lc));
  }

  // Build lookup: property name → pattern chain
  const patternChains = new Map<string, string>();
  for (const pc of analysis.patternConstraints) {
    const prop = pc.propertyPath.replace(/^self\./, '');
    const existing = patternChains.get(prop) ?? '';
    patternChains.set(prop, existing + patternConstraintToZodChain(pc));
  }

  const hasConstraints = numericChains.size > 0 || lengthChains.size > 0 || patternChains.size > 0;

  // Class header
  lines.push(`/// Entity: ${entity.name}`);
  if (entity.constraints.length > 0) {
    for (const c of entity.constraints) {
      if (c.message) {
        lines.push(`/// Constraint: ${c.message}`);
      }
    }
  }
  lines.push(`class ${name} {`);
  lines.push(`  final String id;`);

  // Regular properties
  for (const prop of entity.properties) {
    if (prop.name === 'id') continue; // id is always present
    const dartType = irTypeToDart(prop.type, diagnostics);
    const nullable = prop.type.nullable || !prop.modifiers.includes('required') ? '?' : '';
    lines.push(`  final ${dartType}${nullable} ${camelCase(prop.name)};`);
  }

  lines.push('');

  // Constructor
  lines.push(`  const ${name}({`);
  lines.push(`    required this.id,`);
  for (const prop of entity.properties) {
    if (prop.name === 'id') continue;
    const required = prop.modifiers.includes('required') && !prop.type.nullable ? 'required ' : '';
    lines.push(`  ${required}this.${camelCase(prop.name)},`);
  }
  lines.push(`  });`);

  // fromJson factory
  lines.push('');
  lines.push(`  factory ${name}.fromJson(Map<String, dynamic> json) {`);
  lines.push(`    return ${name}(`);

  for (const prop of entity.properties) {
    const fieldName = camelCase(prop.name);
    const isRequired = prop.modifiers.includes('required') && !prop.type.nullable;
    const dartType = irTypeToDart(prop.type, diagnostics);

    let parseExpr = generateJsonParse(prop.name, prop.type, dartType, diagnostics);
    if (!isRequired) {
      parseExpr = `json['${prop.name}'] != null ? ${parseExpr} : null`;
    }
    // For required fields, parseExpr already includes the type cast
    lines.push(`      ${fieldName}: ${parseExpr},`);
  }
  lines.push(`    );`);
  lines.push(`  }`);

  // toJson method
  lines.push('');
  lines.push(`  Map<String, dynamic> toJson() {`);
  lines.push(`    return {`);
  lines.push(`      'id': id,`);
  for (const prop of entity.properties) {
    if (prop.name === 'id') continue;
    const fieldName = camelCase(prop.name);
    const isOptional = !prop.modifiers.includes('required') || prop.type.nullable;
    if (isOptional) {
      lines.push(`      '${prop.name}': ${fieldName},`);
    } else {
      lines.push(`      '${prop.name}': ${fieldName},`);
    }
  }
  lines.push(`    };`);
  lines.push(`  }`);

  // copyWith method
  if (opts.emitEquality) {
    lines.push('');
    lines.push(`  ${name} copyWith({`);
    lines.push(`    String? id,`);
    for (const prop of entity.properties) {
      if (prop.name === 'id') continue;
      const dartType = irTypeToDart(prop.type, diagnostics);
      const nullable = prop.type.nullable || !prop.modifiers.includes('required') ? '?' : '';
      lines.push(`    ${dartType}${nullable} ${camelCase(prop.name)},`);
    }
    lines.push(`  }) {`);
    lines.push(`    return ${name}(`);
    lines.push(`      id: id ?? this.id,`);
    for (const prop of entity.properties) {
      if (prop.name === 'id') continue;
      const fieldName = camelCase(prop.name);
      lines.push(`      ${fieldName}: ${fieldName} ?? this.${fieldName},`);
    }
    lines.push(`    );`);
    lines.push(`  }`);

    // Equality
    lines.push('');
    lines.push(`  @override`);
    lines.push(`  bool operator ==(Object other) {`);
    lines.push(`    if (identical(this, other)) return true;`);
    lines.push(`    return other is ${name} &&`);
    lines.push(`        other.id == id &&`);
    for (const prop of entity.properties) {
      if (prop.name === 'id') continue;
      lines.push(`        other.${camelCase(prop.name)} == ${camelCase(prop.name)} &&`);
    }
    // Remove trailing &&
    const lastIdx = lines.length - 1;
    if (lines[lastIdx].endsWith('&&')) {
      lines[lastIdx] = lines[lastIdx].slice(0, -3);
    }
    lines.push(`;`);
    lines.push(`  }`);
    lines.push('');
    lines.push(`  @override`);
    lines.push(
      `  int get hashCode => Object.hash(id, ${entity.properties
        .filter((p) => p.name !== 'id')
        .map((p) => camelCase(p.name))
        .join(', ')});`,
    );
  }

  // Computed property getters
  if (opts.emitComputedProperties && hasComputed) {
    lines.push('');
    for (const cp of entity.computedProperties) {
      const dartType = irTypeToDart(cp.type, diagnostics);
      const nullable = cp.type.nullable ? '?' : '';
      lines.push(`  /// Computed: ${cp.name}`);
      lines.push(`  ${dartType}${nullable} get ${camelCase(cp.name)} {`);
      lines.push(`    // Expression: ${expressionToDart(cp.expression)}`);
      lines.push(
        `    throw UnimplementedError('Computed property ${cp.name} must be evaluated by the server');`,
      );
      lines.push(`  }`);
    }
  }

  // Validator method
  if (opts.emitValidators && hasConstraints) {
    lines.push('');
    lines.push(`  /// Validates constraints. Returns null if valid, error message otherwise.`);
    lines.push(`  String? validate() {`);

    for (const [propName, chain] of numericChains) {
      const fieldName = camelCase(propName);
      lines.push(`    if (${fieldName} != null) {`);
      if (chain.includes('.min(')) {
        const match = chain.match(/\.min\((\d+)\)/);
        if (match) {
          lines.push(
            `      if (${fieldName}! < ${match[1]}) return '${propName} must be >= ${match[1]}';`,
          );
        }
      }
      if (chain.includes('.max(')) {
        const match = chain.match(/\.max\((\d+)\)/);
        if (match) {
          lines.push(
            `      if (${fieldName}! > ${match[1]}) return '${propName} must be <= ${match[1]}';`,
          );
        }
      }
      lines.push(`    }`);
    }

    for (const [propName, chain] of lengthChains) {
      const fieldName = camelCase(propName);
      lines.push(`    if (${fieldName} != null) {`);
      if (chain.includes('.min(')) {
        const match = chain.match(/\.min\((\d+)\)/);
        if (match) {
          lines.push(
            `      if (${fieldName}!.length < ${match[1]}) return '${propName} must be at least ${match[1]} characters';`,
          );
        }
      }
      if (chain.includes('.max(')) {
        const match = chain.match(/\.max\((\d+)\)/);
        if (match) {
          lines.push(
            `      if (${fieldName}!.length > ${match[1]}) return '${propName} must be at most ${match[1]} characters';`,
          );
        }
      }
      lines.push(`    }`);
    }

    for (const [propName, chain] of patternChains) {
      const fieldName = camelCase(propName);
      const regexMatch = chain.match(/\.regex\(\/(.+?)\/\)/);
      if (regexMatch) {
        lines.push(`    if (${fieldName} != null) {`);
        lines.push(
          `      if (!RegExp(r'${regexMatch[1]}').hasMatch(${fieldName}!)) return '${propName} format is invalid';`,
        );
        lines.push(`    }`);
      }
    }

    lines.push(`    return null;`);
    lines.push(`  }`);
  }

  // toString
  lines.push('');
  lines.push(`  @override`);
  lines.push(`  String toString() => '${name}(id: $id)';`);

  lines.push(`}`);

  return { lines, entityName: name, hasComputed, hasConstraints };
}

/** Generate a JSON parse expression for a property. */
function generateJsonParse(
  jsonKey: string,
  type: IRType,
  dartType: string,
  diagnostics: ProjectionDiagnostic[],
): string {
  const jsonAccess = `json['${jsonKey}']`;

  if (type.name === 'array' && type.generic) {
    const innerDart = irTypeToDart(type.generic, diagnostics);
    return `(${jsonAccess} as List<dynamic>).map((e) => e as ${innerDart}).toList()`;
  }

  if (type.name === 'map' && type.generic) {
    const innerDart = irTypeToDart(type.generic, diagnostics);
    return `(${jsonAccess} as Map<String, dynamic>).map((k, v) => MapEntry(k, v as ${innerDart}))`;
  }

  if (type.name === 'datetime' || type.name === 'date' || type.name === 'timestamp') {
    return `DateTime.parse(${jsonAccess} as String)`;
  }

  if (type.name === 'bool' || type.name === 'boolean') {
    return `${jsonAccess} as bool`;
  }

  if (type.name === 'int' || type.name === 'integer' || type.name === 'bigint') {
    return `${jsonAccess} as int`;
  }

  if (type.name === 'number' || type.name === 'float') {
    return `(${jsonAccess} as num).toDouble()`;
  }

  if (type.name === 'decimal' || type.name === 'money') {
    return `${jsonAccess} as String`;
  }

  if (type.name === 'json' || type.name === 'any') {
    return `${jsonAccess}`;
  }

  if (type.name === 'bytes') {
    return `Uint8List.fromList(${jsonAccess} as List<int>)`;
  }

  // Default: string or unknown
  return `${jsonAccess} as ${dartType}`;
}

/** Convert an IRExpression to a Dart comment representation. */
function expressionToDart(expr: unknown): string {
  if (!expr || typeof expr !== 'object') return 'unknown';
  const e = expr as Record<string, unknown>;
  if (e.kind === 'binary') {
    return `(${expressionToDart(e.left)} ${e.operator} ${expressionToDart(e.right)})`;
  }
  if (e.kind === 'identifier') return String(e.name);
  if (e.kind === 'literal') {
    const val = e.value as Record<string, unknown>;
    if (val.kind === 'string') return `'${val.value}'`;
    if (val.kind === 'number') return String(val.value);
    if (val.kind === 'boolean') return String(val.value);
    return String(val.kind);
  }
  if (e.kind === 'member') {
    return `${expressionToDart(e.object)}.${e.property}`;
  }
  return `<${e.kind}>`;
}

// ============================================================================
// Command model generation
// ============================================================================

function generateCommandModel(
  command: IRCommand,
  _opts: ReturnType<typeof normalizeOptions>,
  diagnostics: ProjectionDiagnostic[],
): string[] {
  const lines: string[] = [];
  const name = pascalCase(command.name);

  // Command params class
  lines.push(`/// Command params: ${command.name}${command.entity ? ` on ${command.entity}` : ''}`);
  lines.push(`class ${name}Params {`);

  if (command.parameters.length === 0) {
    lines.push(`  const ${name}Params();`);
  } else {
    for (const param of command.parameters) {
      const dartType = irTypeToDart(param.type, diagnostics);
      const nullable = param.type.nullable || !param.required ? '?' : '';
      lines.push(`  final ${dartType}${nullable} ${camelCase(param.name)};`);
    }
    lines.push('');
    lines.push(`  const ${name}Params({`);
    for (const param of command.parameters) {
      const isRequired = param.required && !param.type.nullable;
      lines.push(`    ${isRequired ? 'required ' : ''}this.${camelCase(param.name)},`);
    }
    lines.push(`  });`);
  }

  // toJson
  lines.push('');
  lines.push(`  Map<String, dynamic> toJson() {`);
  lines.push(`    return {`);
  for (const param of command.parameters) {
    lines.push(`      '${param.name}': ${camelCase(param.name)},`);
  }
  lines.push(`    };`);
  lines.push(`  }`);

  // fromJson
  lines.push('');
  lines.push(`  factory ${name}Params.fromJson(Map<String, dynamic> json) {`);
  if (command.parameters.length === 0) {
    lines.push(`    return const ${name}Params();`);
  } else {
    lines.push(`    return ${name}Params(`);
    for (const param of command.parameters) {
      const fieldName = camelCase(param.name);
      const dartType = irTypeToDart(param.type, diagnostics);
      const isRequired = param.required && !param.type.nullable;
      let parseExpr = generateJsonParse(param.name, param.type, dartType, diagnostics);
      if (!isRequired) {
        parseExpr = `json['${param.name}'] != null ? ${parseExpr} : null`;
      }
      lines.push(`      ${fieldName}: ${parseExpr},`);
    }
    lines.push(`    );`);
  }
  lines.push(`  }`);

  lines.push(`}`);

  // Return type class (if command has a return type)
  if (command.returns) {
    lines.push('');
    lines.push(`/// Return type for command: ${command.name}`);
    lines.push(`class ${name}Return {`);
    const dartType = irTypeToDart(command.returns, diagnostics);
    lines.push(`  final ${dartType} value;`);
    lines.push('');
    lines.push(`  const ${name}Return({required this.value});`);
    lines.push('');
    lines.push(`  factory ${name}Return.fromJson(Map<String, dynamic> json) {`);
    lines.push(`    return ${name}Return(`);
    lines.push(
      `      value: ${generateJsonParse('value', command.returns, dartType, diagnostics)},`,
    );
    lines.push(`    );`);
    lines.push(`  }`);
    lines.push('');
    lines.push(`  Map<String, dynamic> toJson() => {'value': value};`);
    lines.push(`}`);
  }

  return lines;
}

// ============================================================================
// Enum model generation
// ============================================================================

function generateEnumModel(enumDef: IREnum): string[] {
  const lines: string[] = [];
  const name = pascalCase(enumDef.name);

  lines.push(`/// Enum: ${enumDef.name}`);
  lines.push(`enum ${name} {`);

  for (const val of enumDef.values) {
    const valName = camelCase(val.name);
    const rawValue = val.name;
    lines.push(`  ${valName}('${rawValue}'),`);
  }

  lines.push('');
  lines.push(`  const ${name}(this.value);`);
  lines.push(`  final String value;`);
  lines.push('');
  lines.push(`  static ${name} fromString(String value) {`);
  lines.push(`    return ${name}.values.firstWhere(`);
  lines.push(`      (e) => e.value == value,`);
  lines.push(`      orElse: () => throw ArgumentError('Unknown ${name}: $value'),`);
  lines.push(`    );`);
  lines.push(`  }`);

  lines.push(`}`);

  return lines;
}

// ============================================================================
// Client generation
// ============================================================================

function generateClient(
  ir: IR,
  opts: ReturnType<typeof normalizeOptions>,
  _diagnostics: ProjectionDiagnostic[],
): string[] {
  const lines: string[] = [];
  const className = opts.clientClassName;

  lines.push(`/// Async HTTP client for the Manifest API.`);
  lines.push(`class ${className} {`);
  lines.push(`  final Dio _dio;`);
  lines.push(`  final String baseUrl;`);
  lines.push('');
  lines.push(`  ${className}({`);
  lines.push(`    String? baseUrl,`);
  lines.push(`    Dio? dio,`);
  lines.push(`    String? apiKey,`);
  lines.push(`  })  : baseUrl = baseUrl ?? '${opts.clientBaseUrl}',`);
  lines.push(`        _dio = dio ?? Dio() {`);
  lines.push(`    _dio.options.baseUrl = baseUrl;`);
  lines.push(`    if (apiKey != null) {`);
  lines.push(`      _dio.options.headers['Authorization'] = 'Bearer ' + apiKey;`);
  lines.push(`    }`);
  lines.push(`  }`);

  // Entity CRUD methods
  for (const entity of ir.entities) {
    const name = pascalCase(entity.name);

    // list method
    lines.push('');
    lines.push(`  /// List all ${name} entities.`);
    lines.push(`  Future<List<${name}>> list${name}s() async {`);
    lines.push(`    final response = await _dio.get('/api/${snakeCase(entity.name)}s');`);
    lines.push(`    final List<dynamic> data = response.data as List<dynamic>;`);
    lines.push(
      `    return data.map((json) => ${name}.fromJson(json as Map<String, dynamic>)).toList();`,
    );
    lines.push(`  }`);

    // get method
    lines.push('');
    lines.push(`  /// Get a single ${name} by id.`);
    lines.push(`  Future<${name}> get${name}(String id) async {`);
    lines.push(`    final response = await _dio.get('/api/${snakeCase(entity.name)}s/' + id);`);
    lines.push(`    return ${name}.fromJson(response.data as Map<String, dynamic>);`);
    lines.push(`  }`);

    // delete method
    lines.push('');
    lines.push(`  /// Delete a ${name} by id.`);
    lines.push(`  Future<void> delete${name}(String id) async {`);
    lines.push(`    await _dio.delete('/api/${snakeCase(entity.name)}s/' + id);`);
    lines.push(`  }`);
  }

  // Command methods
  for (const command of ir.commands) {
    const name = pascalCase(command.name);
    const hasParams = command.parameters.length > 0;
    const hasReturn = !!command.returns;

    let returnType = 'Future<void>';
    if (hasReturn) {
      returnType = `Future<${name}Return>`;
    }

    lines.push('');
    if (command.entity) {
      lines.push(`  /// Execute command: ${command.name} on ${command.entity}`);
    } else {
      lines.push(`  /// Execute command: ${command.name}`);
    }

    if (hasParams) {
      lines.push(`  ${returnType} ${camelCase(command.name)}(${name}Params params) async {`);
      if (command.entity) {
        lines.push(`    final response = await _dio.post(`);
        lines.push(
          `      '/api/${snakeCase(command.entity)}s/\${params.id ?? ""}/${snakeCase(command.name)}',`,
        );
        lines.push(`      data: params.toJson(),`);
        lines.push(`    );`);
      } else {
        lines.push(`    final response = await _dio.post(`);
        lines.push(`      '/api/commands/${snakeCase(command.name)}',`);
        lines.push(`      data: params.toJson(),`);
        lines.push(`    );`);
      }
      if (hasReturn) {
        lines.push(`    return ${name}Return.fromJson(response.data as Map<String, dynamic>);`);
      }
    } else {
      lines.push(`  ${returnType} ${camelCase(command.name)}() async {`);
      if (command.entity) {
        lines.push(
          `    final response = await _dio.post('/api/${snakeCase(command.entity)}s/${snakeCase(command.name)}');`,
        );
      } else {
        lines.push(
          `    final response = await _dio.post('/api/commands/${snakeCase(command.name)}');`,
        );
      }
      if (hasReturn) {
        lines.push(`    return ${name}Return.fromJson(response.data as Map<String, dynamic>);`);
      }
    }
    lines.push(`  }`);
  }

  // close method
  lines.push('');
  lines.push(`  void close() {`);
  lines.push(`    _dio.close();`);
  lines.push(`  }`);

  lines.push(`}`);

  return lines;
}

// ============================================================================
// Provider generation (Riverpod / Provider)
// ============================================================================

function generateProviders(
  ir: IR,
  opts: ReturnType<typeof normalizeOptions>,
  _diagnostics: ProjectionDiagnostic[],
): string[] {
  const lines: string[] = [];
  const className = opts.clientClassName;

  if (opts.stateManagement === 'riverpod') {
    // Riverpod providers
    lines.push(`// Riverpod providers for Manifest entities and commands.`);
    lines.push(`// Add flutter_riverpod and riverpod_annotation to your pubspec.yaml.`);
    lines.push('');

    // Client provider
    lines.push(`/// Provider for the ${className} instance.`);
    lines.push(`final ${className.toLowerCase()}Provider = Provider<${className}>((ref) {`);
    lines.push(`  final client = ${className}();`);
    lines.push(`  ref.onDispose(client.close);`);
    lines.push(`  return client;`);
    lines.push(`});`);

    // Entity providers
    for (const entity of ir.entities) {
      const name = pascalCase(entity.name);
      const nameLower = camelCase(entity.name);

      // FutureProvider for list
      lines.push('');
      lines.push(`/// Async provider for all ${name} entities.`);
      lines.push(`final ${nameLower}ListProvider = FutureProvider<List<${name}>>((ref) async {`);
      lines.push(`  final client = ref.watch(${className.toLowerCase()}Provider);`);
      lines.push(`  return client.list${name}s();`);
      lines.push(`});`);

      // Family provider for single
      lines.push('');
      lines.push(`/// Async provider for a single ${name} by id.`);
      lines.push(
        `final ${nameLower}Provider = FutureProvider.family<${name}, String>((ref, id) async {`,
      );
      lines.push(`  final client = ref.watch(${className.toLowerCase()}Provider);`);
      lines.push(`  return client.get${name}(id);`);
      lines.push(`});`);
    }

    // Command providers
    for (const command of ir.commands) {
      const name = pascalCase(command.name);
      const hasParams = command.parameters.length > 0;

      if (hasParams) {
        lines.push('');
        lines.push(`/// Provider that executes the ${name} command.`);
        lines.push(`final ${camelCase(command.name)}Provider = Provider<${name}Command>((ref) {`);
        lines.push(`  return ${name}Command(ref);`);
        lines.push(`});`);
        lines.push('');
        lines.push(`class ${name}Command {`);
        lines.push(`  final Ref ref;`);
        lines.push(`  ${name}Command(this.ref);`);
        lines.push('');
        if (command.returns) {
          lines.push(`  Future<${name}Return> call(${name}Params params) async {`);
        } else {
          lines.push(`  Future<void> call(${name}Params params) async {`);
        }
        lines.push(`    final client = ref.read(${className.toLowerCase()}Provider);`);
        lines.push(`    final result = await client.${camelCase(command.name)}(params);`);
        if (command.entity) {
          lines.push(`    ref.invalidate(${camelCase(command.entity)}ListProvider);`);
        }
        lines.push(`    return result;`);
        lines.push(`  }`);
        lines.push(`}`);
      }
    }
  } else if (opts.stateManagement === 'provider') {
    // Classic Provider (ChangeNotifier)
    lines.push(`// ChangeNotifier providers for Manifest entities and commands.`);
    lines.push(`// Add provider to your pubspec.yaml.`);
    lines.push('');

    // Client provider
    lines.push(`/// InheritedWidget or Provider.of accessor for the ${className}.`);
    lines.push(`final ${className.toLowerCase()}Provider = Provider<${className}>((_) {`);
    lines.push(`  return ${className}();`);
    lines.push(`});`);

    // Entity ChangeNotifiers
    for (const entity of ir.entities) {
      const name = pascalCase(entity.name);
      const nameLower = camelCase(entity.name);

      lines.push('');
      lines.push(`/// ChangeNotifier for ${name} list state.`);
      lines.push(`class ${name}ListNotifier extends ChangeNotifier {`);
      lines.push(`  final ${className} client;`);
      lines.push(`  List<${name}> ${nameLower}s = [];`);
      lines.push(`  bool isLoading = false;`);
      lines.push(`  String? error;`);
      lines.push('');
      lines.push(`  ${name}ListNotifier(this.client);`);
      lines.push('');
      lines.push(`  Future<void> load() async {`);
      lines.push(`    isLoading = true;`);
      lines.push(`    notifyListeners();`);
      lines.push(`    try {`);
      lines.push(`      ${nameLower}s = await client.list${name}s();`);
      lines.push(`      error = null;`);
      lines.push(`    } catch (e) {`);
      lines.push(`      error = e.toString();`);
      lines.push(`    } finally {`);
      lines.push(`      isLoading = false;`);
      lines.push(`      notifyListeners();`);
      lines.push(`    }`);
      lines.push(`  }`);
      lines.push(`}`);
      lines.push('');
      lines.push(
        `final ${nameLower}ListNotifierProvider = ChangeNotifierProvider<${name}ListNotifier>((ref) {`,
      );
      lines.push(`  final client = ref.watch(${className.toLowerCase()}Provider);`);
      lines.push(`  return ${name}ListNotifier(client);`);
      lines.push(`});`);
    }
  }
  // 'none' stateManagement means no providers are generated

  return lines;
}

// ============================================================================
// Package file generation
// ============================================================================

function generatePubspec(opts: ReturnType<typeof normalizeOptions>): string {
  const deps: string[] = ['  dio: ^5.4.0'];
  if (opts.stateManagement === 'riverpod') {
    deps.push('  flutter_riverpod: ^2.4.9');
  } else if (opts.stateManagement === 'provider') {
    deps.push('  provider: ^6.1.2');
  }

  return `name: ${opts.packageName}
description: Auto-generated Manifest client SDK for Flutter/Dart.
version: 0.1.0
publish_to: none

environment:
  sdk: '>=3.2.0 <4.0.0'
  flutter: '>=3.16.0'

dependencies:
${deps.join('\n')}

dev_dependencies:
  lints: ^3.1.0
  test: ^1.24.0
`;
}

function generatePackageReadme(opts: ReturnType<typeof normalizeOptions>): string {
  return `# ${opts.packageName}

Auto-generated Dart/Flutter client SDK for the Manifest API.

## Usage

\`\`\`dart
import 'package:${opts.packageName}/${opts.packageName}.dart';

final client = ${opts.clientClassName}(baseUrl: 'https://api.example.com');

// List entities
final tasks = await client.listTasks();

// Get by id
final task = await client.getTask('task-id');

// Execute commands
await client.updateStatus(UpdateStatusParams(id: 'task-id', newStatus: 'done'));
\`\`\`

## State Management

This package includes ${opts.stateManagement === 'riverpod' ? 'Riverpod' : opts.stateManagement === 'provider' ? 'Provider' : 'no'} state management hooks.
`;
}

// ============================================================================
// Options normalization
// ============================================================================

function normalizeOptions(options?: DartProjectionOptions): {
  stateManagement: DartStateManagement;
  clientBaseUrl: string;
  clientClassName: string;
  emitComputedProperties: boolean;
  emitValidators: boolean;
  emitEquality: boolean;
  emitPackageFiles: boolean;
  packageName: string;
  emitHeader: boolean;
} {
  return {
    stateManagement: options?.stateManagement ?? 'riverpod',
    clientBaseUrl: options?.clientBaseUrl ?? 'http://localhost:3000',
    clientClassName: options?.clientClassName ?? 'ManifestClient',
    emitComputedProperties: options?.emitComputedProperties !== false,
    emitValidators: options?.emitValidators !== false,
    emitEquality: options?.emitEquality !== false,
    emitPackageFiles: options?.emitPackageFiles ?? false,
    packageName: options?.packageName ?? 'manifest_client',
    emitHeader: options?.emitHeader !== false,
  };
}

// ============================================================================
// Header generation
// ============================================================================

function generateHeader(opts: ReturnType<typeof normalizeOptions>): string[] {
  if (!opts.emitHeader) return [];
  return [
    `// Auto-generated by Manifest Dart projection. Do not edit manually.`,
    `// Generated at: ${new Date().toISOString()}`,
    ``,
  ];
}

function generateImports(
  opts: ReturnType<typeof normalizeOptions>,
  includeProviders: boolean,
): string[] {
  const lines: string[] = [];
  lines.push(`import 'dart:typed_data';`);
  lines.push(`import 'package:dio/dio.dart';`);

  if (includeProviders) {
    if (opts.stateManagement === 'riverpod') {
      lines.push(`import 'package:flutter_riverpod/flutter_riverpod.dart';`);
    } else if (opts.stateManagement === 'provider') {
      lines.push(`import 'package:flutter/foundation.dart';`);
      lines.push(`import 'package:provider/provider.dart';`);
    }
  }
  lines.push(``);
  return lines;
}

// ============================================================================
// Main projection class
// ============================================================================

export class DartProjection implements ProjectionTarget {
  readonly name = 'dart';
  readonly description =
    'Dart/Flutter model classes with fromJson/toJson and state management hooks';
  readonly surfaces = [
    'dart.entity',
    'dart.command',
    'dart.models',
    'dart.client',
    'dart.providers',
    'dart.package',
  ] as const;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const diagnostics: ProjectionDiagnostic[] = [];
    const opts = normalizeOptions(request.options as DartProjectionOptions | undefined);

    switch (request.surface) {
      case 'dart.entity':
        return this.generateEntitySurface(ir, request, opts, diagnostics);
      case 'dart.command':
        return this.generateCommandSurface(ir, request, opts, diagnostics);
      case 'dart.models':
        return this.generateModelsSurface(ir, opts, diagnostics);
      case 'dart.client':
        return this.generateClientSurface(ir, opts, diagnostics);
      case 'dart.providers':
        return this.generateProvidersSurface(ir, opts, diagnostics);
      case 'dart.package':
        return this.generatePackageSurface(ir, opts, diagnostics);
      default:
        return {
          artifacts: [],
          diagnostics: [
            {
              severity: 'error',
              code: 'DART_UNKNOWN_SURFACE',
              message: `Unknown surface "${request.surface}". Expected one of: ${this.surfaces.join(', ')}`,
            },
          ],
        };
    }
  }

  private generateEntitySurface(
    ir: IR,
    request: ProjectionRequest,
    opts: ReturnType<typeof normalizeOptions>,
    diagnostics: ProjectionDiagnostic[],
  ): ProjectionResult {
    const entities = request.entity
      ? ir.entities.filter((e) => e.name === request.entity)
      : ir.entities;

    if (request.entity && entities.length === 0) {
      return {
        artifacts: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'DART_ENTITY_NOT_FOUND',
            message: `Entity "${request.entity}" not found in IR`,
            entity: request.entity,
          },
        ],
      };
    }

    const artifacts: ProjectionArtifact[] = [];

    for (const entity of entities) {
      const result = generateEntityModel(entity, opts, diagnostics);
      const lines = [...generateHeader(opts), ...result.lines];
      const code = lines.join('\n');
      artifacts.push({
        id: `dart.entity.${entity.name}`,
        pathHint: `lib/models/${snakeCase(entity.name)}.dart`,
        contentType: 'dart',
        code,
      });
    }

    return { artifacts, diagnostics };
  }

  private generateCommandSurface(
    ir: IR,
    request: ProjectionRequest,
    opts: ReturnType<typeof normalizeOptions>,
    diagnostics: ProjectionDiagnostic[],
  ): ProjectionResult {
    const commands = request.command
      ? ir.commands.filter((c) => c.name === request.command)
      : ir.commands;

    if (request.command && commands.length === 0) {
      return {
        artifacts: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'DART_COMMAND_NOT_FOUND',
            message: `Command "${request.command}" not found in IR`,
          },
        ],
      };
    }

    const artifacts: ProjectionArtifact[] = [];

    for (const command of commands) {
      const lines = generateCommandModel(command, opts, diagnostics);
      const allLines = [...generateHeader(opts), ...lines];
      const code = allLines.join('\n');
      artifacts.push({
        id: `dart.command.${command.name}`,
        pathHint: `lib/commands/${snakeCase(command.name)}_params.dart`,
        contentType: 'dart',
        code,
      });
    }

    return { artifacts, diagnostics };
  }

  private generateModelsSurface(
    ir: IR,
    opts: ReturnType<typeof normalizeOptions>,
    diagnostics: ProjectionDiagnostic[],
  ): ProjectionResult {
    const allLines: string[] = [];
    allLines.push(...generateHeader(opts));
    allLines.push(`// Export all model classes.`);
    allLines.push(`library manifest_models;`);
    allLines.push('');

    // Enums first
    for (const enumDef of ir.enums) {
      allLines.push(...generateEnumModel(enumDef));
      allLines.push('');
    }

    // Entity models
    for (const entity of ir.entities) {
      const result = generateEntityModel(entity, opts, diagnostics);
      allLines.push(...result.lines);
      allLines.push('');
    }

    // Command models
    for (const command of ir.commands) {
      const cmdLines = generateCommandModel(command, opts, diagnostics);
      allLines.push(...cmdLines);
      allLines.push('');
    }

    return {
      artifacts: [
        {
          id: 'dart.models',
          pathHint: 'lib/models/manifest_models.dart',
          contentType: 'dart',
          code: allLines.join('\n'),
        },
      ],
      diagnostics,
    };
  }

  private generateClientSurface(
    ir: IR,
    opts: ReturnType<typeof normalizeOptions>,
    diagnostics: ProjectionDiagnostic[],
  ): ProjectionResult {
    const allLines: string[] = [];
    allLines.push(...generateHeader(opts));
    allLines.push(...generateImports(opts, false));
    allLines.push(...generateClient(ir, opts, diagnostics));

    return {
      artifacts: [
        {
          id: 'dart.client',
          pathHint: 'lib/client/manifest_client.dart',
          contentType: 'dart',
          code: allLines.join('\n'),
        },
      ],
      diagnostics,
    };
  }

  private generateProvidersSurface(
    ir: IR,
    opts: ReturnType<typeof normalizeOptions>,
    diagnostics: ProjectionDiagnostic[],
  ): ProjectionResult {
    const allLines: string[] = [];
    allLines.push(...generateHeader(opts));
    allLines.push(...generateImports(opts, true));
    allLines.push(...generateProviders(ir, opts, diagnostics));

    return {
      artifacts: [
        {
          id: 'dart.providers',
          pathHint: 'lib/providers/manifest_providers.dart',
          contentType: 'dart',
          code: allLines.join('\n'),
        },
      ],
      diagnostics,
    };
  }

  private generatePackageSurface(
    ir: IR,
    opts: ReturnType<typeof normalizeOptions>,
    diagnostics: ProjectionDiagnostic[],
  ): ProjectionResult {
    const artifacts: ProjectionArtifact[] = [];

    // Models file
    const modelsResult = this.generateModelsSurface(ir, opts, diagnostics);
    if (modelsResult.artifacts[0]) {
      artifacts.push(modelsResult.artifacts[0]);
    }

    // Client file
    const clientResult = this.generateClientSurface(ir, opts, diagnostics);
    if (clientResult.artifacts[0]) {
      artifacts.push(clientResult.artifacts[0]);
    }

    // Providers file (if state management is enabled)
    if (opts.stateManagement !== 'none') {
      const providersResult = this.generateProvidersSurface(ir, opts, diagnostics);
      if (providersResult.artifacts[0]) {
        artifacts.push(providersResult.artifacts[0]);
      }
    }

    // Package files
    if (opts.emitPackageFiles) {
      artifacts.push({
        id: 'dart.package.pubspec',
        pathHint: 'pubspec.yaml',
        contentType: 'yaml',
        code: generatePubspec(opts),
      });
      artifacts.push({
        id: 'dart.package.readme',
        pathHint: 'README.md',
        contentType: 'markdown',
        code: generatePackageReadme(opts),
      });
    }

    return { artifacts, diagnostics };
  }
}
