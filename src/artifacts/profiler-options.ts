interface ProfilerCommandLike {
  name: string;
  entity?: string;
}

export interface ProfilerCommandOption {
  commandName: string;
  entityName?: string;
  label: string;
}

export function buildProfilerCommandOptions(ir: {
  commands?: ProfilerCommandLike[];
}): ProfilerCommandOption[] {
  return (ir.commands || []).map((command) => ({
    commandName: command.name,
    entityName: command.entity,
    label: command.entity ? `${command.entity}.${command.name}` : command.name,
  }));
}
