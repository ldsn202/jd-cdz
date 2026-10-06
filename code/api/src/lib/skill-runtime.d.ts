declare module '*transform.mjs' {
  export const CATALOG: string;
  export const TARGETS: Record<string, string[]>;
  export function validateConfig(config: unknown): unknown;
  export function transformRows(
    config: unknown,
    rows: unknown[],
    scope: Record<string, unknown>
  ): {
    ruleCatalogVersion: string;
    status: string;
    rows: { rowIndex: number; output: Record<string, unknown>; ruleResults: unknown[] }[];
    issues: string[];
  };
}

declare module '*skill-runtime/contract.mjs' {
 export function resolvePointer(data:unknown,pointer:string):unknown;
 export function inputIssues(request:unknown):string[];
 export function validateParsing(parsing:unknown):void;
 export function validateAnalysis(request:unknown,analysis:unknown):unknown;
}
