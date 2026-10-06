import type { WorkItemRow } from './work-item-query';

export type ConfigurationVersionView = {
  versionId: string;
  versionNo: number;
  sourceFormatId: string | null;
  sourceFormatVersion: string | null;
  formatStatus: string;
  applicability: unknown;
  rules: unknown[];
  ruleCatalogVersion: string;
  analysisResultId: string;
};

export type ConfigurationTrialView = {
  trialId: string;
  configurationVersionId: string;
  inputSnapshotId: string;
  status: string;
  output: unknown;
  ruleResults: unknown[];
  issues: unknown[];
  checks: Record<string, boolean | null>;
};

export type ConfigurationView = {
  configurationId: string | null;
  candidateVersion: ConfigurationVersionView | null;
  activeVersion: ConfigurationVersionView | null;
  activeVersionId: string | null;
  configurationRowVersion: number | null;
  trial: ConfigurationTrialView | null;
  openQuestions: unknown[];
  rowVersion: number;
  responsibilityVersion: number;
};

type VersionRow = {
  id: string;
  version_no: number;
  source_format_id: string | null;
  source_format_version: string | null;
  format_status: string;
  applicability_json: string;
  rules_json: string;
  open_questions_json: string;
  rule_catalog_version: string;
  analysis_result_id: string;
};

export async function loadVersionView(db: D1Database, versionId: string | null): Promise<ConfigurationVersionView | null> {
  if (!versionId) return null;
  const row = await db
    .prepare(
      `SELECT id, version_no, source_format_id, source_format_version, format_status,
              applicability_json, rules_json, open_questions_json, rule_catalog_version, analysis_result_id
       FROM integration_config_version WHERE id = ?`
    )
    .bind(versionId)
    .first<VersionRow>();
  if (!row) return null;
  return {
    versionId: row.id,
    versionNo: row.version_no,
    sourceFormatId: row.source_format_id,
    sourceFormatVersion: row.source_format_version,
    formatStatus: row.format_status,
    applicability: JSON.parse(row.applicability_json) as unknown,
    rules: JSON.parse(row.rules_json) as unknown[],
    ruleCatalogVersion: row.rule_catalog_version,
    analysisResultId: row.analysis_result_id,
  };
}

type TrialRow = {
  id: string;
  configuration_version_id: string;
  snapshot_id: string;
  status: string;
  output_json: string | null;
  rule_results_json: string;
  issues_json: string;
  checks_json: string;
};

function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

export function trialViewOf(row: TrialRow): ConfigurationTrialView {
  const checks = JSON.parse(row.checks_json) as Record<string, unknown>;
  return {
    trialId: row.id,
    configurationVersionId: row.configuration_version_id,
    inputSnapshotId: row.snapshot_id,
    status: row.status,
    output: row.output_json ? (JSON.parse(row.output_json) as unknown) : null,
    ruleResults: JSON.parse(row.rule_results_json) as unknown[],
    issues: JSON.parse(row.issues_json) as unknown[],
    checks: {
      inputComplete: boolOrNull(checks.input_complete),
      scopeValid: boolOrNull(checks.scope_valid),
      rulesCovered: boolOrNull(checks.rules_covered),
      outputsValid: boolOrNull(checks.outputs_valid),
      meaningsResolved: boolOrNull(checks.meanings_resolved),
    },
  };
}

export async function loadTrialView(db: D1Database, trialId: string): Promise<ConfigurationTrialView | null> {
  const row = await db
    .prepare(
      `SELECT id, configuration_version_id, snapshot_id, status, output_json, rule_results_json, issues_json, checks_json
       FROM configuration_trial WHERE id = ?`
    )
    .bind(trialId)
    .first<TrialRow>();
  return row ? trialViewOf(row) : null;
}

export async function latestTrialForVersion(
  db: D1Database,
  versionId: string
): Promise<ConfigurationTrialView | null> {
  const row = await db
    .prepare(
      `SELECT id, configuration_version_id, snapshot_id, status, output_json, rule_results_json, issues_json, checks_json
       FROM configuration_trial WHERE configuration_version_id = ?
       ORDER BY gmt_create DESC, id DESC LIMIT 1`
    )
    .bind(versionId)
    .first<TrialRow>();
  return row ? trialViewOf(row) : null;
}

export async function readConfigurationView(db: D1Database, row: WorkItemRow): Promise<ConfigurationView> {
  const configurationId = row.integration_config_id;
  const candidate = await loadVersionView(db, row.current_configuration_version_id);
  let activeVersion: ConfigurationVersionView | null = null;
  let activeVersionId: string | null = null;
  let configurationRowVersion: number | null = null;
  let openQuestions: unknown[] = [];
  if (configurationId) {
    const cfg = await db
      .prepare('SELECT current_version_id, row_version FROM integration_config WHERE id = ?')
      .bind(configurationId)
      .first<{ current_version_id: string | null; row_version: number }>();
    activeVersion = await loadVersionView(db, cfg?.current_version_id ?? null);
    activeVersionId = cfg?.current_version_id ?? null;
    configurationRowVersion = cfg?.row_version ?? null;
  }
  if (row.current_configuration_version_id) {
    const v = await db
      .prepare('SELECT open_questions_json FROM integration_config_version WHERE id = ?')
      .bind(row.current_configuration_version_id)
      .first<{ open_questions_json: string }>();
    if (v) openQuestions = JSON.parse(v.open_questions_json) as unknown[];
  }
  const trial = row.current_configuration_version_id
    ? await latestTrialForVersion(db, row.current_configuration_version_id)
    : null;
  return {
    configurationId,
    candidateVersion: candidate,
    activeVersion,
    activeVersionId,
    configurationRowVersion,
    trial,
    openQuestions,
    rowVersion: row.row_version,
    responsibilityVersion: row.responsibility_version,
  };
}
