-- ============================================================================
-- Release 2 / Migration 4 — Attachments (§11, WP5)
--
--   * event_attachments metadata table with RLS (FILE-001)
--   * private 'attachments' storage bucket with size + MIME allow-list
--   * storage.objects policies: membership required for every object request
--     (SEC-002 — knowing a path grants nothing)
--
-- Object path convention: <household_id>/<event_id>/<uuid>-<filename>
-- ============================================================================

create table public.event_attachments (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households (id) on delete cascade,
  event_id          uuid not null references public.events (id) on delete cascade,
  uploader_id       uuid references public.profiles (id),
  original_filename text not null,
  storage_path      text not null unique,
  mime_type         text not null,
  byte_size         bigint not null check (byte_size >= 0),
  checksum          text,
  caption           text,
  created_at        timestamptz not null default now()
);
create index idx_attachments_event on public.event_attachments (event_id);

alter table public.event_attachments enable row level security;
create policy attachments_meta_select on public.event_attachments
  for select using (public.is_member(household_id));
create policy attachments_meta_insert on public.event_attachments
  for insert with check (
    public.member_role(household_id) in ('owner', 'admin', 'user')
    and uploader_id = auth.uid()
  );
create policy attachments_meta_delete on public.event_attachments
  for delete using (
    uploader_id = auth.uid() or public.can_edit_event(event_id)
  );

-- ---------------------------------------------------------------------------
-- Storage bucket + object policies (guarded: no-ops where the storage schema
-- is absent, e.g. local test databases).
-- ---------------------------------------------------------------------------
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'attachments', 'attachments', false,
    26214400,  -- 25 MB per file
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'text/calendar',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    ]
  )
  on conflict (id) do nothing;
exception
  when undefined_table then null;
  when invalid_schema_name then null;
  when insufficient_privilege then null;
end $$;

do $$
begin
  -- Read: any active household member (the first path folder is household_id).
  create policy attachments_object_read on storage.objects
    for select using (
      bucket_id = 'attachments'
      and public.is_member(((storage.foldername(name))[1])::uuid)
    );
  -- Upload: Owner/Admin/User members only, into their own household's folder.
  create policy attachments_object_insert on storage.objects
    for insert with check (
      bucket_id = 'attachments'
      and public.member_role(((storage.foldername(name))[1])::uuid) in ('owner', 'admin', 'user')
    );
  -- Delete: Owner/Admin, or the original uploader.
  create policy attachments_object_delete on storage.objects
    for delete using (
      bucket_id = 'attachments'
      and (
        public.member_role(((storage.foldername(name))[1])::uuid) in ('owner', 'admin')
        or owner = auth.uid()
      )
    );
exception
  when undefined_table then null;
  when undefined_function then null;
  when invalid_schema_name then null;
  when duplicate_object then null;
  when insufficient_privilege then null;
end $$;
