export type Status = 'requested' | 'in_progress' | 'delivered' | 'done';
export type FState = 'open' | 'solved' | 'wontfix' | 'design';
export type Sev = 1 | 2 | 3;

export type Role = 'engineer' | 'ux' | 'admin';
export const ROLES: Record<Role, string> = { engineer: 'Engineer', ux: 'UX team', admin: 'Admin' };

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: Role;
}

export interface RoleAssignment {
  email: string;
  role: Role;
  created_at: string;
}

export interface AppDef {
  id: string;
  name: string;
  sort_order: number;
}

export interface Review {
  id: string;
  app_id: string;
  flow: string;
  platform: string;
  build: string;
  screens: string;
  figma: string;
  languages: string[];
  reach: string;
  story: string;
  requested_by: string | null;
  requester_label: string | null;
  reviewer: string | null;
  reviewer_label: string | null;
  status: Status;
  created_at: string;
  started_at: string | null;
  delivered_at: string | null;
  closed_at: string | null;
  page: string | null;
  source: string;
  slack: Record<string, string>;
  updated_at: string;
}

export interface ShotRef {
  path: string;
  name: string;
  by: string | null;
  at: string;
}

export interface Finding {
  id: string;
  review_id: string;
  code: string;
  flow_group: string;
  flow: string;
  screen: string;
  type: string;
  lang: string;
  sev: Sev;
  description: string;
  prod: string;
  figma: string;
  state: FState;
  state_by: string | null;
  state_label: string | null;
  state_at: string | null;
  note: string;
  note_by: string | null;
  note_label: string | null;
  note_at: string | null;
  images: ShotRef[];
  created_by: string | null;
  created_label: string | null;
  created_at: string;
  updated_at: string;
  sort_order: number;
  source: string;
}

export const STATUS: Record<Status, string> = { requested: 'Requested', in_progress: 'In progress', delivered: 'Awaiting fixes', done: 'Closed' };
export const SEV: Record<Sev, string> = { 3: 'Major', 2: 'Minor', 1: 'Cosmetic' };
export const FSTATE: Record<FState, string> = { open: 'Open', solved: 'Solved', wontfix: "Won't fix", design: 'Needs design decision' };
export const TYPES = ['Copy', 'Visual', 'Data', 'Missing in prod', 'Missing in Figma', 'Component', 'Flow', 'State', 'RTL/LTR', 'Layout', 'Navigation', 'Typography & spacing', 'Other'];
export const PLATFORMS = ['Android', 'iOS', 'Web'];

/** Chart series for severity — colors validated for CVD separation in light and dark mode. */
export const SEV_SERIES = [
  { key: '3', label: 'Major', color: 'var(--c-major)' },
  { key: '2', label: 'Minor', color: 'var(--c-minor)' },
  { key: '1', label: 'Cosmetic', color: 'var(--c-cosmetic)' },
];
export const PROGRESS_SERIES = [
  { key: 'solved', label: 'Solved', color: 'var(--ok)' },
  { key: 'other', label: "Won't fix / design", color: 'var(--off)' },
  { key: 'open', label: 'Open', color: 'var(--surface-2)' },
];

export interface ReviewStats { total: number; open: number; solved: number; wontfix: number; design: number; s3: number; s2: number; s1: number }
