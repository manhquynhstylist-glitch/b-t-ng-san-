-- Run once in Supabase SQL Editor. Re-running does not remove user data.
create table if not exists public.account_roles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check (role in ('admin'))
);
alter table public.account_roles enable row level security;
revoke all on public.account_roles from anon, authenticated;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.account_roles where user_id=(select auth.uid()) and role='admin');
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create table if not exists public.listings (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 title text not null check(char_length(btrim(title)) between 10 and 140),
 purpose text not null default 'rent' check(purpose in ('rent','sale')),
 type text not null check(type in ('Mặt bằng','Căn hộ chung cư','Chung cư mini, căn hộ dịch vụ','Nhà riêng','Nhà biệt thự, liền kề','Nhà mặt phố')),
 city text not null check(char_length(city) between 2 and 80),
 district text not null check(char_length(district) between 2 and 100),
 address text not null check(char_length(btrim(address)) between 5 and 180),
 price numeric not null check(price>0 and price<=1000000000),
 area numeric not null check(area>0 and area<=1000000),
 rooms integer not null default 1 check(rooms between 1 and 100),
 agent text not null check(char_length(btrim(agent)) between 2 and 80),
 phone text not null check(phone ~ '^\+?[0-9 ]{9,15}$'),
 description text not null check(char_length(btrim(description)) between 20 and 3000),
 image_path text not null check(image_path like owner_id::text || '/%'),
 status text not null default 'draft' check(status in ('draft','published','hidden')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists listings_owner_idx on public.listings(owner_id);
create index if not exists listings_public_idx on public.listings(status,purpose,created_at desc);
alter table public.listings enable row level security;
grant select on public.listings to anon,authenticated;
grant insert,update,delete on public.listings to authenticated;
drop policy if exists listings_read on public.listings;
create policy listings_read on public.listings for select using(status='published' or owner_id=(select auth.uid()));
drop policy if exists listings_insert on public.listings;
create policy listings_insert on public.listings for insert to authenticated with check(owner_id=(select auth.uid()));
drop policy if exists listings_update on public.listings;
create policy listings_update on public.listings for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
drop policy if exists listings_delete on public.listings;
create policy listings_delete on public.listings for delete to authenticated using(owner_id=(select auth.uid()));
create or replace function private.touch_listing() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists touch_listing on public.listings;
create trigger touch_listing before update on public.listings for each row execute function private.touch_listing();

create table if not exists public.leads (
 id uuid primary key default gen_random_uuid(), name text not null check(char_length(name) between 2 and 80),
 phone text not null check(phone ~ '^\+?[0-9 ]{9,15}$'),
 need text not null check(char_length(need) between 10 and 2000),
 status text not null default 'new' check(status in ('new','contacted','closed')),
 consent_at timestamptz not null default now(), created_at timestamptz not null default now()
);
alter table public.leads enable row level security;
revoke all on public.leads from anon,authenticated;
grant select,update on public.leads to authenticated;
drop policy if exists leads_admin_read on public.leads;
create policy leads_admin_read on public.leads for select to authenticated using((select private.is_admin()));
drop policy if exists leads_admin_update on public.leads;
create policy leads_admin_update on public.leads for update to authenticated using((select private.is_admin())) with check((select private.is_admin()));
-- Prevent admin clients from accidentally modifying consent and customer fields.
revoke update on public.leads from authenticated;
grant update(status) on public.leads to authenticated;
create table if not exists private.lead_requests(request_hash text not null, created_at timestamptz not null default now());
create index if not exists lead_requests_window_idx on private.lead_requests(request_hash,created_at);
create or replace function public.submit_lead(p_name text,p_phone text,p_need text,p_request_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_request_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_hash,0));
 if (select count(*) from private.lead_requests where request_hash=p_request_hash and created_at>now()-interval '1 hour')>=5 then return false; end if;
 delete from private.lead_requests where created_at<now()-interval '1 day';
 insert into public.leads(name,phone,need) values(btrim(p_name),btrim(p_phone),btrim(p_need));
 insert into private.lead_requests(request_hash) values(p_request_hash);
 return true;
end; $$;
revoke all on function public.submit_lead(text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_lead(text,text,text,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('listing-images','listing-images',true,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
drop policy if exists images_read on storage.objects;
create policy images_read on storage.objects for select using(bucket_id='listing-images');
drop policy if exists images_insert on storage.objects;
create policy images_insert on storage.objects for insert to authenticated with check(bucket_id='listing-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists images_delete on storage.objects;
create policy images_delete on storage.objects for delete to authenticated using(bucket_id='listing-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
