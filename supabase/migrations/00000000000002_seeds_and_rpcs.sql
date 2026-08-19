-- ============================================================================
-- Release 1 / Migration 2 — Category seed data (Appendix A) + RPCs
--
--   * category_seeds: the 100 recommended household categories. Colors are
--     presentation defaults; admins recolor freely after seeding (§9).
--   * create_household(): creates household + owner membership + default
--     calendar, and copies the seed categories in. Idempotent per household.
--   * add_member_by_email(): Owner/Admin adds a family member who has already
--     signed up. Inviting never auto-creates an account (§8).
-- ============================================================================

create table public.category_seeds (
  sort_order integer primary key,
  group_name text not null,
  name       text not null,
  slug       text not null unique,
  color      text not null
);

-- Not household data, but keep it locked down: readable only through the
-- SECURITY DEFINER function below.
alter table public.category_seeds enable row level security;

insert into public.category_seeds (sort_order, group_name, name, slug, color) values
  (1, 'Family & Household', 'Family', 'family', '#8c2f21'),
  (2, 'Family & Household', 'Spouse / Partner', 'spouse-partner', '#a33726'),
  (3, 'Family & Household', 'Kids', 'kids', '#ba3f2c'),
  (4, 'Family & Household', 'Parenting', 'parenting', '#cf4733'),
  (5, 'Family & Household', 'Family Gathering', 'family-gathering', '#d45c49'),
  (6, 'Family & Household', 'Household Admin', 'household-admin', '#80382d'),
  (7, 'Family & Household', 'Home Project', 'home-project', '#954134'),
  (8, 'Family & Household', 'Visitor / Guest', 'visitor-guest', '#aa4a3c'),
  (9, 'Family & Household', 'Birthday', 'birthday', '#bd5444'),
  (10, 'Family & Household', 'Anniversary', 'anniversary', '#c56759'),
  (11, 'School & Learning', 'School', 'school', '#214e8c'),
  (12, 'School & Learning', 'Daycare', 'daycare', '#265aa3'),
  (13, 'School & Learning', 'Parent Teacher Conference', 'parent-teacher-conference', '#2c67ba'),
  (14, 'School & Learning', 'School Assignment', 'school-assignment', '#3374cf'),
  (15, 'School & Learning', 'Study', 'study', '#4983d4'),
  (16, 'School & Learning', 'Training / Class', 'training-class', '#2d5080'),
  (17, 'School & Learning', 'School Event', 'school-event', '#345d95'),
  (18, 'School & Learning', 'Field Trip', 'field-trip', '#3c6aaa'),
  (19, 'School & Learning', 'College / Campus', 'college-campus', '#4477bd'),
  (20, 'School & Learning', 'Tutoring', 'tutoring', '#5986c5'),
  (21, 'Work & Business', 'Work', 'work', '#2a218c'),
  (22, 'Work & Business', 'Remote Work', 'remote-work', '#3126a3'),
  (23, 'Work & Business', 'Meeting', 'meeting', '#372cba'),
  (24, 'Work & Business', 'Deadline', 'deadline', '#4033cf'),
  (25, 'Work & Business', 'Business Travel', 'business-travel', '#5549d4'),
  (26, 'Work & Business', 'Client Appointment', 'client-appointment', '#342d80'),
  (27, 'Work & Business', 'Networking', 'networking', '#3c3495'),
  (28, 'Work & Business', 'Conference', 'conference', '#453caa'),
  (29, 'Work & Business', 'Shift / Schedule', 'shift-schedule', '#4e44bd'),
  (30, 'Work & Business', 'Volunteer Work', 'volunteer-work', '#6259c5'),
  (31, 'Health & Wellness', 'Doctor', 'doctor', '#218c4e'),
  (32, 'Health & Wellness', 'Dentist', 'dentist', '#26a35a'),
  (33, 'Health & Wellness', 'Vision / Eye Care', 'vision-eye-care', '#2cba67'),
  (34, 'Health & Wellness', 'Therapy / Counseling', 'therapy-counseling', '#33cf74'),
  (35, 'Health & Wellness', 'Medication', 'medication', '#49d483'),
  (36, 'Health & Wellness', 'Fitness / Gym', 'fitness-gym', '#2d8050'),
  (37, 'Health & Wellness', 'Sports Practice', 'sports-practice', '#34955d'),
  (38, 'Health & Wellness', 'Sports Game', 'sports-game', '#3caa6a'),
  (39, 'Health & Wellness', 'Wellness / Self Care', 'wellness-self-care', '#44bd77'),
  (40, 'Health & Wellness', 'Veterinary', 'veterinary', '#59c586'),
  (41, 'Home Services', 'Auto Service', 'auto-service', '#8c5321'),
  (42, 'Home Services', 'Home Repair', 'home-repair', '#a36126'),
  (43, 'Home Services', 'HVAC', 'hvac', '#ba6e2c'),
  (44, 'Home Services', 'Plumbing', 'plumbing', '#cf7c33'),
  (45, 'Home Services', 'Electrical', 'electrical', '#d48a49'),
  (46, 'Home Services', 'Cleaning Service', 'cleaning-service', '#80542d'),
  (47, 'Home Services', 'Pest Control', 'pest-control', '#956234'),
  (48, 'Home Services', 'Contractor', 'contractor', '#aa6f3c'),
  (49, 'Home Services', 'Home Security', 'home-security', '#bd7d44'),
  (50, 'Home Services', 'Pool / Spa Care', 'pool-spa-care', '#c58b59'),
  (51, 'Money & Administration', 'Bills', 'bills', '#218c89'),
  (52, 'Money & Administration', 'Mortgage / Rent', 'mortgage-rent', '#26a39f'),
  (53, 'Money & Administration', 'Insurance', 'insurance', '#2cbab5'),
  (54, 'Money & Administration', 'Taxes', 'taxes', '#33cfca'),
  (55, 'Money & Administration', 'Banking', 'banking', '#49d4d0'),
  (56, 'Money & Administration', 'Budget Review', 'budget-review', '#2d807e'),
  (57, 'Money & Administration', 'Pay Day', 'pay-day', '#349592'),
  (58, 'Money & Administration', 'Subscription Renewal', 'subscription-renewal', '#3caaa6'),
  (59, 'Money & Administration', 'Legal', 'legal', '#44bdb9'),
  (60, 'Money & Administration', 'Documents / Records', 'documents-records', '#59c5c1'),
  (61, 'Social & Entertainment', 'Holiday', 'holiday', '#72218c'),
  (62, 'Social & Entertainment', 'Party', 'party', '#8426a3'),
  (63, 'Social & Entertainment', 'Dinner / Meal', 'dinner-meal', '#962cba'),
  (64, 'Social & Entertainment', 'Date Night', 'date-night', '#a833cf'),
  (65, 'Social & Entertainment', 'Movie / Theater', 'movie-theater', '#b249d4'),
  (66, 'Social & Entertainment', 'Concert', 'concert', '#6c2d80'),
  (67, 'Social & Entertainment', 'Festival / Fair', 'festival-fair', '#7d3495'),
  (68, 'Social & Entertainment', 'Game Night', 'game-night', '#8e3caa'),
  (69, 'Social & Entertainment', 'Friends', 'friends', '#9f44bd'),
  (70, 'Social & Entertainment', 'Hobby', 'hobby', '#aa59c5'),
  (71, 'Travel & Transportation', 'Flight', 'flight', '#216e8c'),
  (72, 'Travel & Transportation', 'Hotel / Lodging', 'hotel-lodging', '#2680a3'),
  (73, 'Travel & Transportation', 'Road Trip', 'road-trip', '#2c92ba'),
  (74, 'Travel & Transportation', 'Vacation', 'vacation', '#33a3cf'),
  (75, 'Travel & Transportation', 'Commute', 'commute', '#49add4'),
  (76, 'Travel & Transportation', 'Pickup / Dropoff', 'pickup-dropoff', '#2d6980'),
  (77, 'Travel & Transportation', 'Carpool', 'carpool', '#347a95'),
  (78, 'Travel & Transportation', 'Public Transit', 'public-transit', '#3c8baa'),
  (79, 'Travel & Transportation', 'Airport', 'airport', '#449bbd'),
  (80, 'Travel & Transportation', 'Rental Car', 'rental-car', '#59a6c5'),
  (81, 'Chores & Errands', 'Grocery Shopping', 'grocery-shopping', '#6c8c21'),
  (82, 'Chores & Errands', 'Meal Prep', 'meal-prep', '#7ea326'),
  (83, 'Chores & Errands', 'Laundry', 'laundry', '#8fba2c'),
  (84, 'Chores & Errands', 'House Cleaning', 'house-cleaning', '#a0cf33'),
  (85, 'Chores & Errands', 'Yard Work', 'yard-work', '#abd449'),
  (86, 'Chores & Errands', 'Trash / Recycling', 'trash-recycling', '#67802d'),
  (87, 'Chores & Errands', 'Shopping / Errand', 'shopping-errand', '#789534'),
  (88, 'Chores & Errands', 'Delivery / Pickup', 'delivery-pickup', '#89aa3c'),
  (89, 'Chores & Errands', 'Pet Care', 'pet-care', '#99bd44'),
  (90, 'Chores & Errands', 'Routine Maintenance', 'routine-maintenance', '#a4c559'),
  (91, 'Community & Planning', 'Faith / Worship', 'faith-worship', '#8c2157'),
  (92, 'Community & Planning', 'Community Event', 'community-event', '#a32665'),
  (93, 'Community & Planning', 'HOA / Neighborhood', 'hoa-neighborhood', '#ba2c73'),
  (94, 'Community & Planning', 'Club / Organization', 'club-organization', '#cf3381'),
  (95, 'Community & Planning', 'Charity / Fundraiser', 'charity-fundraiser', '#d4498f'),
  (96, 'Community & Planning', 'Library', 'library', '#802d57'),
  (97, 'Community & Planning', 'Reservation', 'reservation', '#953465'),
  (98, 'Community & Planning', 'Reminder', 'reminder', '#aa3c73'),
  (99, 'Community & Planning', 'Emergency / Urgent', 'emergency-urgent', '#bd4481'),
  (100, 'Community & Planning', 'Other', 'other', '#c5598f');

-- ---------------------------------------------------------------------------
-- create_household(name, timezone) -> household id
-- ---------------------------------------------------------------------------
create or replace function public.create_household(
  p_name     text,
  p_timezone text default 'America/Chicago'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'household_name_required';
  end if;

  insert into public.households (name, timezone, created_by)
  values (trim(p_name), coalesce(nullif(trim(p_timezone), ''), 'America/Chicago'), v_uid)
  returning id into v_household;

  insert into public.household_members (household_id, user_id, role, status, invited_by)
  values (v_household, v_uid, 'owner', 'active', v_uid);

  insert into public.calendars (household_id, name, color, is_default, created_by)
  values (v_household, 'Family', '#3b5bdb', true, v_uid);

  insert into public.categories
    (household_id, name, slug, color, group_name, sort_order, active, is_seed)
  select v_household, s.name, s.slug, s.color, s.group_name, s.sort_order, true, true
  from public.category_seeds s
  order by s.sort_order
  on conflict (household_id, slug) do nothing;

  return v_household;
end;
$$;

revoke all on function public.create_household(text, text) from public;
grant execute on function public.create_household(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- add_member_by_email(household, email, role)
-- The person must already have an account (they sign up first, then are added).
-- ---------------------------------------------------------------------------
create or replace function public.add_member_by_email(
  p_household uuid,
  p_email     text,
  p_role      public.household_role default 'user'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_target uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if public.member_role(p_household) not in ('owner', 'admin') then
    raise exception 'not_authorized';
  end if;
  if p_role = 'owner' then
    raise exception 'cannot_grant_owner';  -- ownership transfer is a separate, Owner-only flow
  end if;

  select id into v_target
  from public.profiles
  where lower(email) = lower(trim(p_email));

  if v_target is null then
    raise exception 'no_account_for_email';
  end if;

  insert into public.household_members (household_id, user_id, role, status, invited_by)
  values (p_household, v_target, p_role, 'active', v_uid)
  on conflict (household_id, user_id)
  do update set role = excluded.role, status = 'active';

  return v_target;
end;
$$;

revoke all on function public.add_member_by_email(uuid, text, public.household_role) from public;
grant execute on function public.add_member_by_email(uuid, text, public.household_role) to authenticated;
