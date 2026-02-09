/**
 * manifest init command
 *
 * Interactive setup for Manifest projects.
 * Creates manifest.config.yaml with project-specific settings.
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { saveConfig, configExists } from '../utils/config.js';
import type { ManifestConfig } from '../utils/config.js';

interface InitOptions {
  force?: boolean;
}

interface InitAnswers {
  framework: 'nextjs' | 'remix' | 'vite' | 'other';
  authProvider: 'clerk' | 'nextauth' | 'custom' | 'none';
  databaseImport: string;
  runtimeImport: string;
  responseImport: string;
  outputDir: string;
  useWorkspace: boolean;
  workspacePrefix?: string;
  includeTenantFilter: boolean;
  includeSoftDeleteFilter: boolean;
}

const INIT_QUESTIONS = [
  {
    type: 'list',
    name: 'framework',
    message: 'What framework are you using?',
    choices: [
      { name: 'Next.js (App Router)', value: 'nextjs' },
      { name: 'Remix', value: 'remix' },
      { name: 'Vite / Vanilla', value: 'vite' },
      { name: 'Other', value: 'other' },
    ],
  },
  {
    type: 'list',
    name: 'authProvider',
    message: 'What auth provider?',
    choices: [
      { name: 'Clerk', value: 'clerk' },
      { name: 'NextAuth.js', value: 'nextauth' },
      { name: 'Custom', value: 'custom' },
      { name: 'None', value: 'none' },
    ],
  },
  {
    type: 'confirm',
    name: 'useWorkspace',
    message: 'Are you using a workspace/monorepo (e.g., pnpm workspace)?',
    default: false,
  },
  {
    type: 'input',
    name: 'workspacePrefix',
    message: 'What is your workspace import prefix?',
    default: '@repo/',
    when: (answers: InitAnswers) => answers.useWorkspace,
    validate: (input: string) => {
      if (!input.startsWith('@')) {
        return 'Workspace prefix must start with @ (e.g., @repo/)';
      }
      return true;
    },
  },
  {
    type: 'input',
    name: 'databaseImport',
    message: 'Database import path:',
    default: (answers: InitAnswers) => {
      if (answers.useWorkspace) {
        return `${answers.workspacePrefix}database`;
      }
      return '@/lib/database';
    },
  },
  {
    type: 'input',
    name: 'runtimeImport',
    message: 'Runtime import path:',
    default: (answers: InitAnswers) => {
      if (answers.useWorkspace) {
        return `${answers.workspacePrefix}manifest/runtime`;
      }
      return '@/lib/manifest-runtime';
    },
  },
  {
    type: 'input',
    name: 'responseImport',
    message: 'Response helpers import path:',
    default: (answers: InitAnswers) => {
      if (answers.useWorkspace) {
        return `${answers.workspacePrefix}manifest/response`;
      }
      return '@/lib/manifest-response';
    },
  },
  {
    type: 'input',
    name: 'outputDir',
    message: 'Where should generated routes go?',
    default: (answers: InitAnswers) => {
      if (answers.framework === 'nextjs') {
        return 'app/api/';
      }
      return 'generated/';
    },
  },
  {
    type: 'confirm',
    name: 'includeTenantFilter',
    message: 'Include tenant filtering in generated routes?',
    default: true,
  },
  {
    type: 'confirm',
    name: 'includeSoftDeleteFilter',
    message: 'Include soft-delete filtering in generated routes?',
    default: true,
  },
];

/**
 * Create config from answers
 */
function createConfigFromAnswers(answers: InitAnswers): ManifestConfig {
  const config: ManifestConfig = {
    $schema: 'https://manifest.dev/config.schema.json',
    src: 'modules/**/*.manifest',
    output: 'ir/',
    projections: {
      nextjs: {
        output: answers.outputDir,
        options: {
          authProvider: answers.authProvider,
          authImportPath: answers.authProvider === 'none' ? undefined : answers.useWorkspace
            ? `${answers.workspacePrefix}auth/server`
            : '@/lib/auth',
          databaseImportPath: answers.databaseImport,
          runtimeImportPath: answers.runtimeImport,
          responseImportPath: answers.responseImport,
          includeTenantFilter: answers.includeTenantFilter,
          includeSoftDeleteFilter: answers.includeSoftDeleteFilter,
          tenantIdProperty: 'tenantId',
          deletedAtProperty: 'deletedAt',
          appDir: answers.framework === 'nextjs' ? 'app' : undefined,
        },
      },
    },
    dev: {
      port: 5173,
      watch: true,
    },
    test: {
      coverage: true,
    },
  };

  return config;
}

/**
 * Show post-init messages
 */
function showPostInit(config: ManifestConfig) {
  console.log('');
  console.log(chalk.bold.green('✓ Manifest initialized!'));
  console.log('');
  console.log(chalk.bold('Next steps:'));
  console.log('');
  console.log('1. Create your .manifest files:');
  console.log(chalk.gray(`   ${config.src}`));
  console.log('');
  console.log('2. Generate routes:');
  const opts = config.projections?.nextjs?.options;
  console.log(chalk.gray(`   manifest build modules/ --output ${config.projections?.nextjs?.output} \\`));
  console.log(chalk.gray(`     --database ${opts?.databaseImportPath} \\`));
  console.log(chalk.gray(`     --runtime ${opts?.runtimeImportPath} \\`));
  console.log(chalk.gray(`     --auth ${opts?.authImportPath}`));
  console.log('');
  console.log('3. Or use the config defaults:');
  console.log(chalk.gray(`   manifest build`));
  console.log('');
}

/**
 * Init command handler
 */
export async function initCommand(options: InitOptions = {}): Promise<void> {
  const spinner = ora('Manifest init').start();

  try {
    // Check if config already exists
    if (!options.force && await configExists()) {
      spinner.warn('Config file already exists');
      console.log('');
      console.log('Use --force to overwrite:');
      console.log('  manifest init --force');
      return;
    }

    spinner.text = 'Asking questions...';

    // Ask questions
    const answers = await inquirer.prompt<InitAnswers>(INIT_QUESTIONS);

    spinner.text = 'Creating config file...';

    // Create config
    const config = createConfigFromAnswers(answers);
    await saveConfig(config);

    spinner.succeed('Config file created');

    // Show next steps
    showPostInit(config);

  } catch (error: any) {
    if (error.isTtyError) {
      // Not running in a TTY - use defaults
      spinner.warn('Not a TTY - using defaults');
      const defaultConfig: ManifestConfig = {
        $schema: 'https://manifest.dev/config.schema.json',
        src: 'modules/**/*.manifest',
        output: 'ir/',
        projections: {
          nextjs: {
            output: 'app/api/',
            options: {
              authProvider: 'clerk',
              authImportPath: '@/lib/auth',
              databaseImportPath: '@/lib/database',
              runtimeImportPath: '@/lib/manifest-runtime',
              responseImportPath: '@/lib/manifest-response',
            },
          },
        },
      };
      await saveConfig(defaultConfig);
      spinner.succeed('Config file created with defaults');
      showPostInit(defaultConfig);
    } else {
      spinner.fail(`Init failed: ${error.message}`);
      console.error(error);
      process.exit(1);
    }
  }
}
