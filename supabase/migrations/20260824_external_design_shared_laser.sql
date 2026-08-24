drop policy if exists secure_cuts_select on public.secure_cuts;
create policy secure_cuts_select
on public.secure_cuts for select
to authenticated
using (
  private.is_manager()
  or (select auth.uid()) = owner_id
  or (
    module = 'laser'
    and exists (
      select 1
      from public.profiles p
      where p.user_id = (select auth.uid())
        and p.role = 'employee'
        and p.department in ('external', 'laser')
    )
  )
);

drop policy if exists secure_cuts_insert on public.secure_cuts;
create policy secure_cuts_insert
on public.secure_cuts for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and (
    private.is_manager()
    or exists (
      select 1
      from public.profiles p
      where p.user_id = (select auth.uid())
        and p.role = 'employee'
        and (
          p.department = module
          or (p.department = 'external' and module = 'laser')
        )
    )
  )
);

drop policy if exists secure_cuts_delete on public.secure_cuts;
create policy secure_cuts_delete
on public.secure_cuts for delete
to authenticated
using ((select auth.uid()) = owner_id or private.is_manager());
