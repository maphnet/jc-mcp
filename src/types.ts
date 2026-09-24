export interface LeanIssue {
  key: string;
  summary: string;
  description: string | null;
  status: string;
  type: string;
  priority: string;
  assignee: string | null;
  labels: string[];
  comments: LeanComment[];
}

export interface LeanComment {
  author: string;
  body: string;
  created: string;
}

export interface LeanTransition {
  id: string;
  name: string;
}

export interface LeanSearchResult {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
}

export interface LeanArticle {
  id: string;
  title: string;
  body: string;
  status: string;
  version: number;
  spaceId: string;
  parentId?: string;
}

export interface LeanArticleSearchResult {
  id: string;
  title: string;
  space: string;
  spaceKey: string;
  lastModified: string;
}

export interface LeanUser {
  accountId: string;
  displayName: string;
  email: string;
  active: boolean;
}

export interface ToolSuccess {
  ok: true;
  [key: string]: unknown;
}
