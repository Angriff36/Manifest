/**
 * Custom ESLint rule to prevent hardcoded version strings.
 *
 * Version strings should be imported from `./version` or `../version`
 * to maintain a single source of truth.
 *
 * Valid exceptions:
 * - Import statements from version files
 * - Conformance test expected files (generated)
 * - Test data/fixtures
 * - package.json (handled separately)
 */

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prevent hardcoded version strings - import from version.ts instead',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowPatterns: {
            type: 'array',
            items: { type: 'string' },
          },
          versionImportPath: {
            type: 'string',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      hardcodedVersion: 'Hardcoded version "{{version}}" found. Import from "{{importPath}}" instead.',
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const allowPatterns = options.allowPatterns || [
      '**/conformance/expected/**',
      '**/fixtures/**',
      '**/*.test.ts',
      '**/*.test.tsx',
    ];
    const versionImportPath = options.versionImportPath || './version';

    const filename = context.getFilename();
    const path = filename.replace(/\\/g, '/');

    // Check if file should be excluded
    const shouldExclude = allowPatterns.some((pattern) => {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      );
      return regex.test(path);
    });

    if (shouldExclude) {
      return {};
    }

    // Check if file already imports from version file
    let hasVersionImport = false;
    const versionImportPatterns = [
      /from\s+['"](\.\/|\.\.\/)+version['"]/,
      /from\s+['"](\.\/|\.\.\/)+version\.ts['"]/,
      /import.*version/i,
    ];

    return {
      Program(node) {
        const sourceCode = context.getSourceCode();
        const source = sourceCode.getText();

        // Check for version imports
        hasVersionImport = versionImportPatterns.some((pattern) =>
          pattern.test(source)
        );
      },

      Literal(node) {
        if (hasVersionImport) {
          return; // File already imports version, assume it's used correctly
        }

        if (typeof node.value === 'string') {
          // Check for semver pattern (X.Y.Z format)
          // Exclude things that look like dates (X.Y.ZZZZ) or IP addresses
          const parts = node.value.split('.');
          if (parts.length === 3) {
            const [major, minor, patch] = parts;
            // All parts should be numeric and reasonably sized for versions
            if (
              /^\d+$/.test(major) &&
              /^\d+$/.test(minor) &&
              /^\d+$/.test(patch) &&
              // Exclude dates (e.g., 2024.12.25)
              !/^\d{4}/.test(major) &&
              // Exclude very large numbers that might not be versions
              parseInt(major, 10) < 1000 &&
              parseInt(minor, 10) < 1000 &&
              parseInt(patch, 10) < 1000
            ) {
              context.report({
                node,
                messageId: 'hardcodedVersion',
                data: {
                  version: node.value,
                  importPath: versionImportPath,
                },
              });
            }
          }
        }
      },

      TemplateLiteral(node) {
        if (hasVersionImport) {
          return;
        }

        // Check template literals for version patterns
        for (const quasi of node.quasis) {
          const value = quasi.value.cooked;
          const parts = value.split('.');
          if (parts.length === 3) {
            const [major, minor, patch] = parts;
            if (
              /^\d+$/.test(major) &&
              /^\d+$/.test(minor) &&
              /^\d+$/.test(patch) &&
              !/^\d{4}/.test(major) &&
              parseInt(major, 10) < 1000 &&
              parseInt(minor, 10) < 1000 &&
              parseInt(patch, 10) < 1000
            ) {
              context.report({
                node,
                messageId: 'hardcodedVersion',
                data: {
                  version: value,
                  importPath: versionImportPath,
                },
              });
              break;
            }
          }
        }
      },
    };
  },
};
