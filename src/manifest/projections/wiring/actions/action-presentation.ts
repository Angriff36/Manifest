/**
 * Person-facing facts for a command: words, fields, and whether to offer it.
 * Does not render a screen.
 */

import type { IRCommand, IREnum } from '../../../ir.js';
import { isHardDeleteCommand } from '../../convex/referential-emit.js';
import type {
  WiringActionChoice,
  WiringActionField,
  WiringActionPresentation,
  WiringLifecycleTransition,
  WiringParameterDescriptor,
} from '../types.js';

/** Builds action presentation from the command declaration. */
export class ActionPresentation {
  static from(input: {
    command: IRCommand;
    dispatchable: boolean;
    clientParameters: WiringParameterDescriptor[];
    enums: Map<string, IREnum>;
    transitions: WiringLifecycleTransition[];
  }): WiringActionPresentation {
    const internal = !input.dispatchable || input.command.visibility === 'private';
    return {
      exposure: internal ? 'internal' : 'human',
      label: ActionWords.from(input.command.name),
      confirm: isHardDeleteCommand(input.command),
      fields: input.clientParameters.map((parameter) => this.field(parameter, input.enums)),
      ...this.availability(input.transitions),
    };
  }

  private static field(
    parameter: WiringParameterDescriptor,
    enums: Map<string, IREnum>,
  ): WiringActionField {
    const choices = this.choices(parameter, enums);
    return {
      name: parameter.name,
      label: ActionWords.from(parameter.name),
      required: parameter.required,
      ...(choices ? { choices } : {}),
    };
  }

  private static choices(
    parameter: WiringParameterDescriptor,
    enums: Map<string, IREnum>,
  ): WiringActionChoice[] | undefined {
    const typeName = parameter.arrayElementType ?? parameter.irTypeName;
    const enumDef = enums.get(typeName);
    if (!enumDef) return undefined;
    return enumDef.values.map((value) => ({
      value: value.name,
      label: value.label ?? value.name,
    }));
  }

  private static availability(
    transitions: WiringLifecycleTransition[],
  ): Pick<WiringActionPresentation, 'availableFrom'> {
    if (transitions.length === 0) return {};
    const property = transitions[0]?.property;
    if (!property || transitions.some((transition) => transition.property !== property)) return {};
    return {
      availableFrom: {
        property,
        values: [...new Set(transitions.map((transition) => transition.from))].sort(),
      },
    };
  }
}

/** Turns a command or field name into words. */
export class ActionWords {
  static from(name: string): string {
    const spaced = name
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .trim();
    if (!spaced) return name;
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
  }
}
