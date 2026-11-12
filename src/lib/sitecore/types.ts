export type RedirectType = "Redirect301" | "Redirect302" | "ServerTransfer";

export const REDIRECT_TYPE_LABEL: Record<RedirectType, string> = {
  Redirect301: "301 permanent",
  Redirect302: "302 temporary",
  ServerTransfer: "Server transfer",
};

export interface SiteRef {
  id: string;
  name: string;
  displayName: string;
  language: string;
  languages: string[];
  /** Item ID of the site's home page */
  startItemId?: string;
  /** e.g. /sitecore/content/collection/site */
  rootPath?: string;
  /** e.g. /sitecore/content/collection/site/Home */
  homePath?: string;
  brandKitId?: string;
}

export interface PagePermissions {
  canRename: boolean;
  canDelete: boolean;
  canWrite: boolean;
  canCreate: boolean;
  canPublish: boolean;
}

export interface PageRef {
  id: string;
  name: string;
  displayName: string;
  /** Content tree path, /sitecore/content/... */
  path: string;
  /** Site-relative URL path, e.g. /about/team */
  route: string;
  language: string;
  parentId?: string;
  templateId?: string;
  templateName?: string;
  hasChildren: boolean;
  permissions: PagePermissions;
  locked: boolean;
  lockedByMe: boolean;
  workflowState?: string;
  meta?: PageMeta;
}

export interface PageMeta {
  url?: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
  isPublishable?: boolean;
  hasPublishableVersion?: boolean;
  validFrom?: string;
  validTo?: string;
  workflowFinal?: boolean;
}

export interface PageVersion {
  version: number;
  name?: string;
  language: string;
  updatedAt?: string;
  updatedBy?: string;
  workflowState?: string;
}

export interface TemplateOption {
  id: string;
  name: string;
}

export interface PageComponent {
  id: string;
  name: string;
  placeholder?: string;
  /** As stored on the rendering: a path, a GUID or local:/... */
  dataSource?: string;
  /** Resolved content path */
  dataSourcePath?: string;
  scope: "local" | "shared" | "none" | "unknown";
}

export interface LocaleStat {
  language: string;
  name: string;
  pageCount: number;
}

export interface WorkflowStat {
  workflow: string;
  states: { name: string; pageCount: number }[];
}

export interface TreeNode {
  id: string;
  name: string;
  displayName: string;
  route: string;
  path: string;
  hasChildren: boolean;
  /** false for folders and datasource items: things with no layout aren't pages */
  hasPresentation?: boolean;
  templateId?: string;
  /** Template IDs allowed as children (insert options) */
  insertOptionIds?: string[];
}

export interface RedirectRule {
  /** Stable key: mapId + index */
  key: string;
  mapId: string;
  mapName: string;
  source: string;
  target: string;
  type: RedirectType;
  preserveQueryString: boolean;
  managed: boolean;
}

export interface RedirectMap {
  id: string;
  name: string;
  /** Publishing window from the item's publishing restrictions (used by campaigns) */
  startsAt?: string;
  endsAt?: string;
  campaign?: boolean;
  path: string;
  type: RedirectType;
  preserveQueryString: boolean;
  managed: boolean;
  rules: { source: string; target: string }[];
}

export type ReferenceKind = "page" | "content";

export interface Reference {
  id: string;
  name: string;
  path: string;
  language?: string;
  kind: ReferenceKind;
}

export type RedirectIssueCode = "loop" | "chain" | "shadowed" | "broken" | "duplicate" | "self";

export interface RedirectIssue {
  code: RedirectIssueCode;
  message: string;
  severity: "error" | "warning";
}

export interface LivePage {
  id: string;
  route: string;
}

export interface PageFieldSet {
  version: number;
  fields: { name: string; value: string }[];
  layout: string;
  flags: PageFlags;
}

/** Item-level publishing settings (shared across languages) */
export interface PageFlags {
  neverPublish: boolean;
  publishFrom?: string;
  publishTo?: string;
}

export interface ItemInfo {
  id: string;
  name: string;
  path: string;
  template?: string;
  alt?: string;
}

export interface Dependency {
  id: string;
  name: string;
  path: string;
  kind: "content" | "media" | "page";
  field: string;
  live?: boolean | null;
}

export interface BinEntry {
  id: string;
  name: string;
  displayName: string;
  fromParentId?: string;
  fromRoute?: string;
  deletedAt?: string;
  deletedBy?: string;
}

export interface Campaign {
  id: string;
  name: string;
  path: string;
  startsAt?: string;
  endsAt?: string;
  type: RedirectType;
  rules: { source: string; target: string }[];
  status: "scheduled" | "active" | "ended";
}
