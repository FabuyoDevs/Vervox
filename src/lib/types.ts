export type ViewType = "today" | "scheduled";

/** The three routed screens reachable from the navigation menu. */
export type AppView = "all" | "today" | "scheduled";

export type Priority = "low" | "normal" | "high";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface VervoxLocation {
  lat: number;
  lng: number;
  label?: string;
}

export interface Schedule {
  has_alarm: boolean;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
}

/** Rich media proof captured when a task is completed. */
export interface TaskMedia {
  proof_image_url: string | null;
  voice_note_url: string | null;
  voice_duration_ms: number | null;
  captured_by: string | null;
  captured_at: number | null;
}

/** Mirrors the Cloud Firestore `tasks/{task_id}` document shape. */
export interface Task {
  task_id: string;
  title: string;
  created_by: string; // device uuid
  created_by_name: string | null;
  assigned_to: string[]; // device uuids — 2 for a pair, up to 6 for a pod
  member_uids: string[]; // firebase auth uids (used by security rules)
  pod_id: string | null; // set when the task belongs to a group pod
  is_completed: boolean;
  completed_by: string | null;
  completed_at: number | null;
  view_type: ViewType;
  schedule: Schedule | null;
  optional_location: VervoxLocation | null;
  subtasks: Subtask[];
  media: TaskMedia;
  priority: Priority;
  created_at: number;
  updated_at: number;
  order: number;
}

export interface PairCode {
  code: string;
  created_by: string;
  expires_at: number;
  kind: "pair" | "pod";
  pod_id?: string | null;
}

export type BackendMode = "firebase" | "local";

export interface BackendStatus {
  mode: BackendMode;
  uid: string | null;
  ready: boolean;
  error: string | null;
}

/* ----------------------------- Pods ----------------------------- */

export interface PodMember {
  device_id: string;
  uid: string | null;
  name: string;
  joined_at: number;
}

/** A "nudge" — a lightweight ping from one member to the rest of the pod/pair. */
export interface Nudge {
  id: string;
  task_id: string;
  task_title: string;
  from_device: string;
  from_name: string;
  to: string[];
  created_at: number;
}

export interface Pod {
  pod_id: string;
  name: string;
  created_by: string;
  members: PodMember[]; // 3–6 after activation, 1 while seeding
  max_members: number;
  created_at: number;
}

/* -------------------------- Monetization ------------------------ */

export type Tier = "free" | "unlocked" | "pro";

export type SkuId = "themes_pack" | "cloud_media" | "pods_lifetime" | "pro_bundle";

export interface Purchase {
  sku: SkuId;
  at: number;
  /** "live" = confirmed by Flutterwave, "demo" = sandbox checkout receipt. */
  mode: "live" | "demo";
  /** Subscriptions carry a renewal horizon; one-time unlocks are null. */
  renews_at: number | null;
}

export interface Entitlements {
  tier: Tier;
  themes: boolean; // Custom themes + sound packs
  cloudMedia: boolean; // Cloud proof & media storage
  pods: boolean; // Group pods (3–6 members)
  pro: boolean; // Pro bundle
  purchases: Purchase[];
}

export const POD_MAX_MEMBERS = 6;
export const POD_MIN_ACTIVE = 3;
export const MAX_VOICE_MS = 15_000;
