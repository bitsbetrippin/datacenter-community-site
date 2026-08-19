export type Role = "owner" | "admin" | "user" | "viewer";
export type EventStatus = "confirmed" | "tentative" | "canceled";
export type EventVisibility = "household" | "private";

export interface Household {
  id: string;
  name: string;
  timezone: string;
  week_start: number;
  default_view: string;
  default_event_duration_minutes: number;
  show_birthdays: boolean;
  default_category_id: string | null;
}

export interface Membership {
  household_id: string;
  user_id: string;
  role: Role;
  status: "active" | "disabled";
  households?: Household;
}

export interface CalendarRow {
  id: string;
  household_id: string;
  name: string;
  color: string;
  is_default: boolean;
  source: string; // 'local' | 'google' | 'microsoft' | ...
  connection_id: string | null;
  sync_direction: "twoway" | "pull" | "push";
}

export interface ServiceConnection {
  id: string;
  household_id: string;
  provider_code: string;
  account_email: string | null;
  status: "connected" | "attention" | "paused" | "failed" | "disconnected";
  status_detail: string | null;
  last_success_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface ConflictRow {
  id: string;
  household_id: string;
  event_id: string;
  connection_id: string | null;
  local_snapshot: { canon: Record<string, unknown>; etag: string | null };
  remote_snapshot: { canon: Record<string, unknown>; etag: string | null };
  state: "open" | "resolved";
  created_at: string;
}

export interface EventProviderMapping {
  id: string;
  event_id: string;
  connection_id: string;
  remote_event_id: string;
  last_synced_at: string | null;
  deleted_remote: boolean;
}

export interface Category {
  id: string;
  household_id: string;
  name: string;
  slug: string;
  color: string;
  foreground: string | null;
  group_name: string | null;
  sort_order: number;
  active: boolean;
}

export interface EventRow {
  id: string;
  household_id: string;
  calendar_id: string;
  category_id: string | null;
  organizer_user_id: string | null;
  title: string;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date_exclusive: string | null;
  timezone: string;
  all_day: boolean;
  location_text: string | null;
  status: EventStatus;
  visibility: EventVisibility;
  recurrence_series_id: string | null;
  original_occurrence_at: string | null;
  needs_attention: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EventRecurrence {
  series_id: string;
  household_id: string;
  event_id: string;
  rrule: string;
  exdates: string[];
}

export type AttendeeType =
  | "required"
  | "optional"
  | "organizer"
  | "child"
  | "driver"
  | "observer";
export type RsvpState = "needs_response" | "accepted" | "declined" | "tentative";

export interface Person {
  id: string;
  household_id: string;
  display_name: string;
  email: string | null;
  birthday: string | null;
  anniversary: string | null;
  notes: string | null;
  member_user_id: string | null;
}

export interface EventAttendee {
  id: string;
  household_id: string;
  event_id: string;
  member_user_id: string | null;
  person_id: string | null;
  display_name: string;
  email: string | null;
  attendee_type: AttendeeType;
  rsvp: RsvpState;
  comment: string | null;
}

export interface EventReminder {
  id: string;
  household_id: string;
  event_id: string;
  offset_minutes: number;
  channel: "inapp";
  scope: "creator" | "household";
  created_by: string;
}

export interface EventAttachment {
  id: string;
  household_id: string;
  event_id: string;
  uploader_id: string | null;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  created_at: string;
}

export interface AppNotification {
  id: string;
  household_id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  event_id: string | null;
  occurrence_start: string | null;
  read_at: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: number;
  household_id: string | null;
  actor: string | null;
  action: string;
  object_type: string;
  object_id: string | null;
  summary: Record<string, unknown> | null;
  created_at: string;
}

export interface SavedFilter {
  name: string;
  cats: string[];
  cals: string[];
  person: string | null;
}

export interface MemberWithProfile {
  household_id: string;
  user_id: string;
  role: Role;
  status: "active" | "disabled";
  profiles: {
    display_name: string | null;
    email: string | null;
  } | null;
}
