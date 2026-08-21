create table if not exists public.secure_cuts (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_name text not null,
  owner_email text not null,
  module text not null check (module in ('external','laser','print')),
  dealer text not null default '',
  note text not null default '',
  material text not null,
  category text not null default 'material',
  width double precision not null default 0 check (width >= 0),
  height double precision not null default 0 check (height >= 0),
  qty integer not null check (qty > 0),
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists secure_cuts_owner_created_idx
  on public.secure_cuts(owner_id, created_at desc);
create index if not exists secure_cuts_module_date_idx
  on public.secure_cuts(module, date desc);

alter table public.secure_cuts enable row level security;
grant select, insert, delete on public.secure_cuts to authenticated;

drop policy if exists secure_cuts_select on public.secure_cuts;
create policy secure_cuts_select on public.secure_cuts for select to authenticated
using ((select auth.uid()) = owner_id or private.is_manager());

drop policy if exists secure_cuts_insert on public.secure_cuts;
create policy secure_cuts_insert on public.secure_cuts for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and (
    private.is_manager()
    or exists (
      select 1 from public.profiles p
      where p.user_id = (select auth.uid())
        and p.role = 'employee'
        and p.department = module
    )
  )
);

drop policy if exists secure_cuts_delete on public.secure_cuts;
create policy secure_cuts_delete on public.secure_cuts for delete to authenticated
using ((select auth.uid()) = owner_id or private.is_manager());
