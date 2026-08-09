export interface SyncWrite {
  path: string;
  content: string;
  description: string;
  tags: string[];
}

export interface SyncRunResult {
  actor: string;
  writes: SyncWrite[];
  cursor: string;
}

export interface JiraSyncConfig {
  actor: string;
  featurePrefix?: string;
}

