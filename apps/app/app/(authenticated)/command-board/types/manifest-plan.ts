import { z } from "zod";

export const ENTITY_TYPE_VALUES = [
  "event",
  "client",
  "prep_task",
  "kitchen_task",
  "employee",
  "inventory_item",
  "recipe",
  "dish",
  "proposal",
  "shipment",
  "note",
] as const;

const entityTypeSchema = z.enum(ENTITY_TYPE_VALUES);

export const manifestEntityRefSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.string().min(1),
});

export const manifestPlanQuestionSchema = z.object({
  questionId: z.string().min(1),
  prompt: z.string().min(1),
  type: z.enum(["string", "enum", "date", "number", "select"]),
  options: z.array(z.string().min(1)).optional(),
  required: z.boolean().default(true),
});

export const addNodeMutationSchema = z.object({
  type: z.literal("addNode"),
  previewNodeId: z.string().min(1),
  entityType: entityTypeSchema,
  entityId: z.string().min(1),
  positionX: z.number(),
  positionY: z.number(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const removeNodeMutationSchema = z.object({
  type: z.literal("removeNode"),
  projectionId: z.string().min(1),
});

export const moveNodeMutationSchema = z.object({
  type: z.literal("moveNode"),
  projectionId: z.string().min(1),
  positionX: z.number(),
  positionY: z.number(),
});

export const highlightNodeMutationSchema = z.object({
  type: z.literal("highlightNode"),
  projectionId: z.string().min(1),
  color: z.string().optional(),
  note: z.string().optional(),
});

export const addEdgeMutationSchema = z.object({
  type: z.literal("addEdge"),
  edgeId: z.string().min(1).optional(),
  sourceProjectionId: z.string().min(1),
  targetProjectionId: z.string().min(1),
  label: z.string().optional(),
  color: z.string().optional(),
  style: z.enum(["solid", "dashed", "dotted"]).optional(),
});

export const removeEdgeMutationSchema = z.object({
  type: z.literal("removeEdge"),
  edgeId: z.string().min(1),
});

export const annotateMutationSchema = z.object({
  type: z.literal("annotate"),
  label: z.string().min(1),
  color: z.string().optional(),
});

export const boardMutationSchema = z.discriminatedUnion("type", [
  addNodeMutationSchema,
  removeNodeMutationSchema,
  moveNodeMutationSchema,
  highlightNodeMutationSchema,
  addEdgeMutationSchema,
  removeEdgeMutationSchema,
  annotateMutationSchema,
]);

export const domainCommandStepSchema = z.object({
  stepId: z.string().min(1),
  entityType: entityTypeSchema.optional(),
  entityId: z.string().optional(),
  commandName: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
  expectedEvents: z.array(z.string().min(1)).optional(),
  failureModes: z.array(z.string().min(1)).optional(),
});

export const manifestExecutionSchema = z.object({
  mode: z.enum(["dry_run", "execute"]),
  idempotencyKey: z.string().min(1),
});

export const manifestTraceSchema = z.object({
  reasoningSummary: z.string().min(1),
  citations: z.array(z.string().min(1)).optional(),
});

export const suggestedManifestPlanSchema = z.object({
  planId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1),
  scope: z.object({
    boardId: z.string().min(1),
    tenantId: z.string().min(1),
    entities: z.array(manifestEntityRefSchema),
  }),
  prerequisites: z.array(manifestPlanQuestionSchema).default([]),
  boardPreview: z.array(boardMutationSchema).default([]),
  domainPlan: z.array(domainCommandStepSchema).default([]),
  execution: manifestExecutionSchema,
  trace: manifestTraceSchema,
});

export const suggestManifestPlanInputSchema = suggestedManifestPlanSchema
  .omit({
    planId: true,
    scope: true,
  })
  .extend({
    scope: z
      .object({
        entities: z.array(manifestEntityRefSchema).default([]),
      })
      .default({ entities: [] }),
  });

export const planRecordPayloadSchema = z.object({
  state: z.enum(["pending", "approved", "failed"]),
  boardId: z.string().min(1),
  requestedBy: z.string().nullable(),
  requestedAt: z.string().min(1),
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.string().optional(),
  plan: suggestedManifestPlanSchema,
  result: z
    .object({
      success: z.boolean(),
      summary: z.string(),
      stepResults: z.array(
        z.object({
          stepId: z.string(),
          success: z.boolean(),
          message: z.string(),
          error: z.string().optional(),
        })
      ),
      boardMutationResults: z.array(
        z.object({
          mutationType: z.string(),
          success: z.boolean(),
          message: z.string(),
          error: z.string().optional(),
        })
      ),
    })
    .optional(),
});

export type ManifestEntityRef = z.infer<typeof manifestEntityRefSchema>;
export type ManifestPlanQuestion = z.infer<typeof manifestPlanQuestionSchema>;
export type BoardMutation = z.infer<typeof boardMutationSchema>;
export type DomainCommandStep = z.infer<typeof domainCommandStepSchema>;
export type SuggestedManifestPlan = z.infer<typeof suggestedManifestPlanSchema>;
export type SuggestManifestPlanInput = z.infer<
  typeof suggestManifestPlanInputSchema
>;
export type ManifestPlanRecordPayload = z.infer<typeof planRecordPayloadSchema>;
