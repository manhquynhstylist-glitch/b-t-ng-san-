-- Run in Supabase SQL Editor for an existing installation.
begin;
-- Keep existing listings compatible when upgrading from the original category name.
alter table public.listings drop constraint if exists listings_type_check;
update public.listings set type='Mặt bằng kinh doanh' where type='Mặt bằng';
alter table public.listings add constraint listings_type_check check(type in ('Mặt bằng kinh doanh','Sang nhượng cửa hàng kinh doanh','Mặt bằng văn phòng','Căn hộ chung cư','Chung cư mini, căn hộ dịch vụ','Nhà riêng','Nhà biệt thự, liền kề','Nhà mặt phố'));
commit;
