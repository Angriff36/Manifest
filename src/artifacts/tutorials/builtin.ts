/**
 * Built-in tutorials shipped with the Manifest diagnostic UI.
 * These are defined as structured JSON following the Tutorial interface,
 * and can be extended/replaced by community-contributed tutorials.
 *
 * Note: Uses actual Manifest syntax. Properties are declared as
 * `property name: type` inside entity blocks.
 */
import type { Tutorial } from './types';

export const BUILTIN_TUTORIALS: Tutorial[] = [
  {
    id: 'first-program',
    title: 'Your First Manifest Program',
    description: 'Learn the basics of Manifest by defining a simple entity with a property.',
    difficulty: 'beginner',
    estimatedMinutes: 5,
    author: 'Manifest Team',
    tags: ['basics', 'entity', 'property'],
    steps: [
      {
        id: 'hello-entity',
        title: 'Define an Entity',
        instruction:
          'In Manifest, an **entity** describes a business object. Start by defining an entity called `Task` using the `entity` keyword. An entity is defined with a name followed by a block of curly braces.',
        starterCode: '// Define a Task entity below\n\n',
        expectedCode: 'entity Task {\n  // properties go here\n}\n',
        hints: [
          { text: 'Use the `entity` keyword, then the name `Task`, then `{ }` braces.' },
          { text: 'Entity syntax: `entity Name { ... }`' },
          { final: true, text: 'The answer is:\n```\nentity Task {\n}\n```' },
        ],
        validation: [{ type: 'compiles' }, { type: 'has-entity', name: 'Task' }],
        unlocks: ['properties', 'types'],
      },
      {
        id: 'add-property',
        title: 'Add a Property',
        instruction:
          'Entities have **properties** that describe their data. Add a `title` property of type `string` to the `Task` entity. Properties are declared with the `property` keyword and go inside the entity block.',
        starterCode: 'entity Task {\n  // add a title property here\n}\n',
        expectedCode: 'entity Task {\n  property title: string\n}\n',
        hints: [
          { text: 'Property syntax: `property name: type` - for example `property title: string`' },
          { text: "Don't forget - properties go INSIDE the curly braces." },
          {
            final: true,
            text: 'The answer is:\n```\nentity Task {\n  property title: string\n}\n```',
          },
        ],
        validation: [
          { type: 'compiles' },
          { type: 'has-entity', name: 'Task' },
          { type: 'has-property', entity: 'Task', property: 'title', typeName: 'string' },
        ],
        unlocks: ['commands', 'computed'],
      },
      {
        id: 'add-more-properties',
        title: 'Add More Properties',
        instruction:
          'Real entities have multiple properties. Add two more to `Task`: a `status` of type `string`, and a `createdAt` of type `number`. Each property goes on its own line inside the entity block.',
        starterCode: 'entity Task {\n  property title: string\n  // add status and createdAt\n}\n',
        expectedCode:
          'entity Task {\n  property title: string\n  property status: string\n  property createdAt: number\n}\n',
        hints: [
          { text: 'Put each property on its own line using the `property` keyword.' },
          {
            final: true,
            text: 'The answer is:\n```\nentity Task {\n  property title: string\n  property status: string\n  property createdAt: number\n}\n```',
          },
        ],
        validation: [
          { type: 'compiles' },
          { type: 'has-property', entity: 'Task', property: 'title' },
          { type: 'has-property', entity: 'Task', property: 'status' },
          { type: 'has-property', entity: 'Task', property: 'createdAt' },
        ],
        unlocks: ['policies', 'stores'],
      },
    ],
  },
  {
    id: 'commands-intro',
    title: 'Writing Your First Command',
    description: 'Learn how to define commands with guards and mutations.',
    difficulty: 'beginner',
    estimatedMinutes: 8,
    author: 'Manifest Team',
    tags: ['commands', 'guards', 'mutations'],
    prerequisites: ['first-program'],
    steps: [
      {
        id: 'define-command',
        title: 'Define a Command',
        instruction:
          'A **command** is a business operation that can be invoked. Define a command called `completeTask` that takes a `taskId: string` parameter inside the `Task` entity. Commands use the `command` keyword.',
        starterCode:
          'entity Task {\n  property title: string\n  property status: string\n\n  // Define a completeTask command below\n}\n',
        expectedCode:
          'entity Task {\n  property title: string\n  property status: string\n\n  command completeTask(taskId: string) {\n    // actions go here\n  }\n}\n',
        hints: [
          { text: 'Command syntax inside an entity: `command name(param: type) { ... }`' },
          { text: 'The command block can be left empty for now.' },
          {
            final: true,
            text: 'The answer is:\n```\ncommand completeTask(taskId: string) {\n}\n```',
          },
        ],
        validation: [{ type: 'compiles' }, { type: 'has-command', name: 'completeTask' }],
      },
      {
        id: 'add-guard',
        title: 'Add a Guard',
        instruction:
          'Guards protect commands by checking conditions before the command runs. Add a guard to `completeTask` that ensures the task is not already completed. Guards use the `guard` keyword and a boolean expression.',
        starterCode:
          'entity Task {\n  property title: string\n  property status: string\n\n  command completeTask(taskId: string) {\n    // add a guard here\n  }\n}\n',
        expectedCode:
          'entity Task {\n  property title: string\n  property status: string\n\n  command completeTask(taskId: string) {\n    guard self.status != "completed"\n  }\n}\n',
        hints: [
          { text: 'Guard syntax: `guard expression` where expression is boolean.' },
          { text: 'Inside a command, reference entity properties via `self.status`.' },
          {
            final: true,
            text: 'The answer is:\n```\ncommand completeTask(taskId: string) {\n  guard self.status != "completed"\n}\n```',
          },
        ],
        validation: [{ type: 'compiles' }, { type: 'has-guard', command: 'completeTask' }],
      },
      {
        id: 'add-mutation',
        title: 'Mutate State',
        instruction:
          'Commands **mutate** entity state. Add a `mutate` action to `completeTask` that sets `status` to `"completed"`. The `mutate` keyword assigns a new value to a property.',
        starterCode:
          'entity Task {\n  property title: string\n  property status: string\n\n  command completeTask(taskId: string) {\n    guard self.status != "completed"\n    // add a mutate here\n  }\n}\n',
        expectedCode:
          'entity Task {\n  property title: string\n  property status: string\n\n  command completeTask(taskId: string) {\n    guard self.status != "completed"\n    mutate self.status = "completed"\n  }\n}\n',
        hints: [
          { text: 'Mutation syntax: `mutate self.property = value`' },
          { text: 'The `mutate` keyword goes after the guard.' },
          {
            final: true,
            text: 'The answer is:\n```\ncommand completeTask(taskId: string) {\n  guard self.status != "completed"\n  mutate self.status = "completed"\n}\n```',
          },
        ],
        validation: [{ type: 'compiles' }, { type: 'source-contains', text: 'mutate' }],
      },
    ],
  },
  {
    id: 'computed-intro',
    title: 'Computed Properties',
    description: 'Auto-calculating fields that update like a spreadsheet.',
    difficulty: 'intermediate',
    estimatedMinutes: 5,
    author: 'Manifest Team',
    tags: ['computed', 'derived', 'properties'],
    prerequisites: ['first-program'],
    steps: [
      {
        id: 'add-numeric-props',
        title: 'Setup: Numeric Properties',
        instruction:
          'Computed properties need inputs. Add `price: number` and `quantity: number` properties to a `LineItem` entity.',
        starterCode: 'entity LineItem {\n  // add price and quantity\n}\n',
        expectedCode:
          'entity LineItem {\n  property price: number\n  property quantity: number\n}\n',
        hints: [
          { text: 'Use the `number` type for numeric properties.' },
          {
            final: true,
            text: 'The answer is:\n```\nentity LineItem {\n  property price: number\n  property quantity: number\n}\n```',
          },
        ],
        validation: [
          { type: 'compiles' },
          { type: 'has-entity', name: 'LineItem' },
          { type: 'has-property', entity: 'LineItem', property: 'price', typeName: 'number' },
          { type: 'has-property', entity: 'LineItem', property: 'quantity', typeName: 'number' },
        ],
      },
      {
        id: 'add-computed',
        title: 'Add a Computed Property',
        instruction:
          'A **computed** property is automatically derived from other properties. Add a computed property `subtotal: number` to `LineItem` that equals `price * quantity`.',
        starterCode:
          'entity LineItem {\n  property price: number\n  property quantity: number\n  // add a computed property here\n}\n',
        expectedCode:
          'entity LineItem {\n  property price: number\n  property quantity: number\n  computed subtotal: number = price * quantity\n}\n',
        hints: [
          { text: 'Computed syntax: `computed name: type = expression`' },
          { text: 'The expression is a normal Manifest expression using other properties.' },
          {
            final: true,
            text: 'The answer is:\n```\nentity LineItem {\n  property price: number\n  property quantity: number\n  computed subtotal: number = price * quantity\n}\n```',
          },
        ],
        validation: [
          { type: 'compiles' },
          { type: 'has-computed', entity: 'LineItem', name: 'subtotal' },
        ],
      },
    ],
  },
];
