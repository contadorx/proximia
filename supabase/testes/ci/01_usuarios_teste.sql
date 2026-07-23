-- =====================================================================
-- Preparo : 01_usuarios_teste.sql
-- Para    : criar em auth.users as pessoas que os testes de
--           supabase/testes esperam encontrar. No Supabase real elas
--           nascem pela tela de cadastro; aqui, direto na tabela.
-- Gatilho : o insert dispara trg_criar_perfil (migration 0001), entao
--           os perfis em public.perfis nascem junto — como no produto.
-- =====================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', 'gestor@exemplo.com',    '{"nome":"Gestora de Teste"}'),
  ('00000000-0000-4000-8000-00000000000b', 'analista@exemplo.com',  '{"nome":"Analista de Teste"}'),
  ('00000000-0000-4000-8000-00000000000c', 'focal@exemplo.com',     '{"nome":"Ponto Focal de Teste"}'),
  ('00000000-0000-4000-8000-00000000000d', 'usuario-a@exemplo.com', '{"nome":"Usuária A"}'),
  ('00000000-0000-4000-8000-00000000000e', 'usuario-b@exemplo.com', '{"nome":"Usuário B"}')
on conflict (email) do nothing;
