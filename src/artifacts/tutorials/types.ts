/**
 * Tutorial type definitions for the interactive tutorial mode.
 * Tutorials are defined as structured JSON that can be contributed by the community.
 */

/** A single hint displayed inline during a tutorial step */
export interface TutorialHint {
  /** The hint text to show */
  text: string;
  /** Optional: only show this hint after a certain number of failed validation attempts */
  afterFailures?: number;
  /** Whether this is the "final" hint shown when user is stuck */
  final?: boolean;
}

/** Validation rule for a tutorial step - checks if the user's code meets the step's goal */
export type StepValidation =
  | { type: 'compiles' } // Source must compile without errors
  | { type: 'has-entity'; name: string } // Must define an entity with this name
  | { type: 'has-property'; entity: string; property: string; typeName?: string } // Must have a property
  | { type: 'has-command'; name: string; entity?: string } // Must have a command
  | { type: 'has-guard'; command: string } // Command must have a guard
  | { type: 'has-computed'; entity: string; name: string } // Must have a computed property
  | { type: 'has-policy'; name: string; action?: string } // Must have a policy
  | { type: 'source-contains'; text: string } // Source must contain this text
  | { type: 'source-matches'; pattern: string } // Source must match this regex
  | { type: 'ir-has'; path: string; value?: unknown }; // IR must have a value at a given path

/** A single step in a tutorial */
export interface TutorialStep {
  /** Unique identifier within the tutorial */
  id: string;
  /** Title shown in the step header */
  title: string;
  /** Main instructional text explaining the concept */
  instruction: string;
  /** Starter code to load into the editor for this step */
  starterCode: string;
  /** Expected code shown as a hint (revealed when user clicks "Show answer") */
  expectedCode: string;
  /** Inline hints shown to help the user */
  hints: TutorialHint[];
  /** Validation rules - all must pass for the step to be "completed" */
  validation: StepValidation[];
  /** Features/concepts unlocked by completing this step (for progressive disclosure) */
  unlocks?: string[];
  /** If true, this step is optional (can be skipped) */
  optional?: boolean;
}

/** A full tutorial definition */
export interface Tutorial {
  /** Unique identifier */
  id: string;
  /** Display title */
  title: string;
  /** Short description shown in the tutorial list */
  description: string;
  /** Difficulty level */
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  /** Estimated time to complete in minutes */
  estimatedMinutes: number;
  /** Author/contributor name */
  author: string;
  /** Tags for filtering/categorization */
  tags: string[];
  /** The ordered steps in this tutorial */
  steps: TutorialStep[];
  /** Prerequisites: IDs of other tutorials that should be completed first */
  prerequisites?: string[];
}

/** Result of validating a step */
export interface ValidationResult {
  /** The step ID this validation result is for (guards against race conditions) */
  stepId: string;
  /** Whether the step is complete */
  passed: boolean;
  /** Individual check results */
  checks: CheckResult[];
  /** Human-readable message about the overall result */
  message: string;
  /** If the step has a compilation error, store it here */
  compileError?: string;
}

export interface CheckResult {
  /** Description of what was checked */
  description: string;
  /** Whether this specific check passed */
  passed: boolean;
  /** Optional detail about why it failed */
  detail?: string;
}

/** Tutorial progress state - persisted to localStorage */
export interface TutorialProgress {
  /** Map of tutorial ID to completed step IDs */
  completedSteps: Record<string, string[]>;
  /** Map of tutorial ID to whether the entire tutorial was completed */
  completedTutorials: Record<string, boolean>;
  /** Currently active tutorial ID */
  activeTutorialId: string | null;
}
