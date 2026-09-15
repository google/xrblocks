import type {UIElement} from './UIElement';

export type UIValidationCode =
  | 'not-ready'
  | 'not-mounted'
  | 'invalid-layout'
  | 'content-overflow'
  | 'text-clipped'
  | 'outside-viewport';

export interface UIValidationBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UIValidationIssue {
  readonly code: UIValidationCode;
  readonly severity: 'warning' | 'error';
  readonly element?: UIElement;
  readonly message: string;
  readonly bounds?: UIValidationBounds;
  readonly containerBounds?: UIValidationBounds;
}

export interface UIValidationReport {
  readonly ready: boolean;
  readonly ok: boolean;
  readonly issues: readonly UIValidationIssue[];
}

export function createUIValidationReport(
  ready: boolean,
  issues: readonly UIValidationIssue[]
): UIValidationReport {
  return {
    ready,
    ok: ready && issues.every((issue) => issue.severity !== 'error'),
    issues: Object.freeze([...issues]),
  };
}
