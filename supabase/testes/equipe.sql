-- =====================================================================
-- Teste: equipe (B44) — responsável sem usuário e vínculo no aceite
--
-- NÃO é migration. Rode no editor SQL depois da 0034 para conferir as
-- três garantias da feature. Tudo roda em transação e desfaz no fim.
-- =====================================================================
begin;

-- Cenário mínimo: uma organização e uma pessoa sem login.
insert into public.orgs (id, nome, slug)
values ('00000000-0000-4000-8000-00000000e001', 'Org Teste Equipe', 'org-teste-equipe');

insert into public.equipe (id, org_id, nome, email)
values ('00000000-0000-4000-8000-00000000e002',
        '00000000-0000-4000-8000-00000000e001',
        'Pessoa Sem Login', 'pessoa@teste-equipe.com');

-- 1. Pessoa sem login pode ser responsável por carteira.
insert into public.carteiras (id, org_id, nome, responsavel_id)
values ('00000000-0000-4000-8000-00000000e003',
        '00000000-0000-4000-8000-00000000e001',
        'Carteira Teste',
        '00000000-0000-4000-8000-00000000e002');

do $$
begin
  if not exists (
    select 1 from public.carteiras
     where id = '00000000-0000-4000-8000-00000000e003'
       and responsavel_id = '00000000-0000-4000-8000-00000000e002'
  ) then
    raise exception 'FALHOU: responsavel sem login nao foi aceito na carteira';
  end if;
  raise notice 'OK: pessoa sem login e responsavel valido';
end $$;

-- 2. O aceite (membership) casa a pessoa pelo e-mail, mantendo o id dela.
--    Simula um usuário cujo perfil tem o mesmo e-mail.
insert into auth.users (id, email)
values ('00000000-0000-4000-8000-00000000e004', 'pessoa@teste-equipe.com')
on conflict (id) do nothing;

insert into public.perfis (id, nome, email)
values ('00000000-0000-4000-8000-00000000e004', 'Pessoa Agora Com Login', 'pessoa@teste-equipe.com')
on conflict (id) do nothing;

insert into public.memberships (org_id, user_id, papel)
values ('00000000-0000-4000-8000-00000000e001',
        '00000000-0000-4000-8000-00000000e004', 'analista');

do $$
declare
  v public.equipe;
begin
  select * into v from public.equipe
   where org_id = '00000000-0000-4000-8000-00000000e001'
     and user_id = '00000000-0000-4000-8000-00000000e004';

  if v.id is distinct from '00000000-0000-4000-8000-00000000e002' then
    raise exception 'FALHOU: o aceite deveria casar com a pessoa existente (id %), mas veio %',
      '00000000-0000-4000-8000-00000000e002', v.id;
  end if;
  raise notice 'OK: aceite casou pelo e-mail e manteve o id da pessoa';
end $$;

-- 3. E a carteira continua com o mesmo responsável depois do vínculo.
do $$
begin
  if not exists (
    select 1 from public.carteiras
     where id = '00000000-0000-4000-8000-00000000e003'
       and responsavel_id = '00000000-0000-4000-8000-00000000e002'
  ) then
    raise exception 'FALHOU: a carteira perdeu o responsavel no vinculo';
  end if;
  raise notice 'OK: nada foi redigitado — o que ela respondia continua dela';
end $$;

rollback;
