-- =====================================================================
-- Importação — os tipos que a tela oferece precisam gravar.
--
-- Este teste existe por um defeito real: a tela oferecia seis recursos e
-- a trava do banco aceitava quatro. A conferência do arquivo passava,
-- porque ela é toda em TypeScript, e a falha só aparecia ao gravar o
-- registro da importação — depois de a pessoa já ter subido a planilha.
--
-- É o risco de manter a mesma lista em dois lugares. Enquanto os dois
-- existirem, este teste é o que segura.
-- =====================================================================

do $$
declare
  v_org uuid; v_dono uuid; v_id uuid;
  t text;
  v_tipos text[] := array['carteiras','contas','contratos','frentes','oportunidades','maturidade'];
begin
  select id into v_dono from auth.users where email = 'gestor@exemplo.com';

  insert into public.orgs (nome, slug) values ('Import SA', 'import-sa') returning id into v_org;
  insert into public.memberships (org_id, user_id, papel) values (v_org, v_dono, 'owner');

  foreach t in array v_tipos loop
    begin
      insert into public.importacoes (org_id, tipo, arquivo_nome, status, criado_por)
      values (v_org, t, 'teste.csv', 'conferida', v_dono)
      returning id into v_id;
    exception when check_violation then
      raise exception 'FALHOU: o tipo "%" é oferecido pela tela e recusado pelo banco.', t;
    end;
  end loop;
  raise notice '1. os seis tipos oferecidos pela tela gravam sem erro';

  -- E um tipo inventado continua recusado: a trava fechada é de propósito,
  -- senão importação com tipo errado passa e some do agrupamento da tela.
  begin
    insert into public.importacoes (org_id, tipo, arquivo_nome, status, criado_por)
    values (v_org, 'coisa_inventada', 'teste.csv', 'conferida', v_dono);
    raise exception 'FALHOU: aceitou tipo de importação inexistente.';
  exception
    when check_violation then
      raise notice '2. tipo inexistente continua recusado';
    when others then
      if sqlerrm like 'FALHOU%' then raise; end if;
      raise notice '2. tipo inexistente continua recusado';
  end;

  delete from public.orgs where slug = 'import-sa';
  raise notice 'TODOS OS TESTES DE TIPO DE IMPORTAÇÃO PASSARAM';
end $$;
