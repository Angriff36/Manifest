/**
 * manifest init command
 *
 * Creates a manifest.config.yaml for Manifest projects.
 * Asks for the final output paths - no guessing, no doubling.
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { saveConfig, configExists, type ManifestConfig } from '../utils/config.js';

interface InitOptions {
  force?: boolean;
}

interface InitAnswers {
  sourcePattern: string;
  outputDir: string;
  enableCodegen: boolean;
  projectionTarget?: string;
  codeOutputDir?: string;
}

const INIT_QUESTIONS = [
  {
    type: 'input',
    name: 'sourcePattern',
    message: 'Where are your .manifest files?',
    default: '**/*.manifest',
    validate: (input: string) => input.length > 0 || 'Pattern cannot be empty',
  },
  {
    type: 'input',
    name: 'outputDir',
    message: 'Where should IR output go?',
    default: 'ir/',
    validate: (input: string) => input.length > 0 || 'Path cannot be empty',
  },
  {
    type: 'confirm',
    name: 'enableCodegen',
    message: 'Will you be generating code from IR?',
    default: false,
  },
  {
    type: 'input',
    name: 'projectionTarget',
    message: 'What projection target? (e.g., nextjs, remix, vue, express)',
    default: 'nextjs',
    when: (answers: InitAnswers) => answers.enableCodegen,
    validate: (input: string) => input.length > 0 || 'Target cannot be empty',
  },
  {
    type: 'input',
    name: 'codeOutputDir',
    message: 'Where should generated code be written? (final destination)',
    default: (answers: InitAnswers) => {
      if (answers.projectionTarget === 'nextjs') {
        return 'app/api';
      }
      if (answers.projectionTarget === 'remix') {
        return 'app/api';
      }
      return 'generated';
    },
    when: (answers: InitAnswers) => answers.enableCodegen,
    validate: (input: string) => input.length > 0 || 'Path cannot be empty',
  },
];

/**
 * Create config from answers
 */
function createConfigFromAnswers(answers: InitAnswers): ManifestConfig {
  const config: ManifestConfig = {
    $schema: 'https://manifest.dev/config.schema.json',
    src: answers.sourcePattern,
    output: answers.outputDir,
  };

  if (answers.enableCodegen && answers.projectionTarget && answers.codeOutputDir) {
    config.projections = {
      [answers.projectionTarget]: {
        output: answers.codeOutputDir,
      },
    };
  }

  return config;
}

/**
 * Show post-init messages
 */
function showPostInit(answers: InitAnswers, config: ManifestConfig) {
  console.log('');
  console.log(chalk.bold.green('✓ Manifest initialized!'));
  console.log('');
  console.log(chalk.bold('Config created: manifest.config.yaml'));
  console.log('');
  console.log(chalk.bold('Quick start:'));
  console.log('');
  console.log('1. Create a Manifest file:');
  console.log(chalk.gray("   echo 'entity User { name: string }' > User.manifest"));
  console.log('');
  console.log('2. Compile to IR:');
  console.log(chalk.gray(`   manifest compile User.manifest`));
  console.log(chalk.gray(`   manifest compile User.manifest -o ${config.output}user.json`));
  console.log('');
  console.log('3. Compile all files:');
  console.log(chalk.gray('   manifest compile'));
  console.log('');

  if (answers.enableCodegen && answers.projectionTarget) {
    console.log('4. Generate code:');
    const output = config.projections?.[answers.projectionTarget]?.output || 'generated';
    console.log(chalk.gray(`   manifest generate ${config.output} -o ${output}`));
    console.log(chalk.gray(`   manifest generate ${config.output} -p ${answers.projectionTarget}`));
    console.log('');
  }

  console.log(chalk.gray('Edit manifest.config.yaml to customize paths and outputs.'));
  console.log('');
}

/**
 * Init command handler
 */
export async function initCommand(options: InitOptions = {}): Promise<void> {
  try {
    // Check if config already exists
    if (!options.force && await configExists()) {
      console.log(chalk.yellow('Config file already exists'));
      console.log('');
      console.log('Use --force to overwrite:');
      console.log('  manifest init --force');
      return;
    }

    // Ask questions
    const answers = await inquirer.prompt<InitAnswers>(INIT_QUESTIONS);

    // Create config
    const config = createConfigFromAnswers(answers);
    await saveConfig(config);

    // Show next steps
    showPostInit(answers, config);

  } catch (error: any) {
    if (error.isTtyError) {
      // Not running in a TTY - use minimal defaults
      console.log(chalk.yellow('Not an interactive terminal - using defaults'));
      const defaultConfig: ManifestConfig = {
        $schema: 'https://manifest.dev/config.schema.json',
        src: '**/*.manifest',
        output: 'ir/',
      };
      await saveConfig(defaultConfig);

      console.log(chalk.bold.green('✓ Manifest initialized!'));
      console.log('');
      console.log('Edit manifest.config.yaml to customize paths and outputs.');
      console.log('');
    } else {
      console.error(chalk.red(`Init failed: ${error.message}`));
      console.error(error);
      process.exit(1);
    }
  }
}
