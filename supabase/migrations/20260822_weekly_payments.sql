create table if not exists public.weekly_payments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references auth.users(id) on delete cascade,
  employee_name text not null,
  module text not null check (module in ('external', 'laser', 'print')),
  week_start date not null,
  week_end date not null,
  total_sqm numeric(14, 2) not null default 0 check (total_sqm >= 0),
  amount numeric(14, 2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  paid_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (employee_id, module, week_start),
  check (week_end = week_start + 6)
);

create index if not exists weekly_payments_employee_week_idx
  on public.weekly_payments(employee_id, week_start desc);

create index if not exists weekly_payments_module_week_idx
  on public.weekly_payments(module, week_start desc);

create index if not exists weekly_payments_paid_by_idx
  on public.weekly_payments(paid_by);

alter table public.weekly_payments enable row level security;

revoke all privileges on public.weekly_payments from anon;
revoke delete, truncate, trigger, references on public.weekly_payments from authenticated;
grant select, insert, update on public.weekly_payments to authenticated;

drop policy if exists weekly_payments_select on public.weekly_payments;
create policy weekly_payments_select
on public.weekly_payments for select
to authenticated
using (
  (select auth.uid()) = employee_id
  or (select private.is_manager())
);

drop policy if exists weekly_payments_insert on public.weekly_payments;
create policy weekly_payments_insert
on public.weekly_payments for insert
to authenticated
with check (
  (select private.is_manager())
  and (select auth.uid()) = paid_by
);

drop policy if exists weekly_payments_update on public.weekly_payments;
create policy weekly_payments_update
on public.weekly_payments for update
to authenticated
using ((select private.is_manager()))
with check (
  (select private.is_manager())
  and (select auth.uid()) = paid_by
);
