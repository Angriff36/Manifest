export type ChangeType = 'added' | 'removed' | 'changed';
export type RiskLevel = 'high' | 'low';
export interface Change {
    path: string;
    changeType: ChangeType;
    beforeHash: string | null;
    afterHash: string | null;
    label: string | null;
    risk: RiskLevel;
}
export interface LabelMapping {
    pathPrefix: string;
    label: string;
}
export interface DiffConfig {
    labels: LabelMapping[];
    highRisk: string[];
}
export interface DiffSummary {
    totalChanges: number;
    added: number;
    removed: number;
    changed: number;
    highRiskCount: number;
    changes: Change[];
}
