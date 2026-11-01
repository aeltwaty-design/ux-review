-- Teams: add "Product team"; "Design" becomes "UX team" (id ux). Idempotent. (Applied to the live project on 1 Nov via SQL.)
insert into public.teams (id, name, sort_order) values ('product', 'Product team', 2), ('ux', 'UX team', 10)
on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;
update public.profiles set team_id = 'ux' where team_id = 'design';
update public.findings set team_id = 'ux' where team_id = 'design';
update public.role_assignments set team_id = 'ux' where team_id = 'design';
delete from public.teams where id = 'design';
update public.teams t set sort_order = v.o
from (values ('engineering', 1), ('product', 2), ('data', 3), ('marketing', 4), ('marketplace', 5), ('customer_support', 6),
             ('customer_success', 7), ('business', 8), ('management', 9), ('ux', 10)) as v(id, o)
where t.id = v.id;
