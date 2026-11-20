-- Compras da Mudança - schema do banco
-- Rodar inteiro no SQL Editor do Supabase (projeto xkfsnorxusihsvbftirg)

-- ---------- Tabelas ----------
create table if not exists public.itens (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  link          text,
  loja          text,
  preco         numeric(12,2) not null default 0 check (preco >= 0),
  quantidade    integer not null default 1 check (quantidade > 0),
  comodo        text,
  prioridade    text not null default 'media' check (prioridade in ('alta','media','baixa')),
  status        text not null default 'pendente' check (status in ('pendente','comprado')),
  imagem_1      text,  -- URL pública da foto no bucket "fotos" (ou URL externa, se não deu para salvar)
  imagem_2      text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.configuracoes (
  id          integer primary key default 1 check (id = 1),
  teto        numeric(12,2) check (teto is null or teto >= 0),
  alerta_pct  integer not null default 80 check (alerta_pct between 1 and 100),
  comodos     text[] not null default array['Sala','Cozinha','Quarto','Banheiro','Área de serviço','Outros']
);

insert into public.configuracoes (id) values (1) on conflict (id) do nothing;

-- ---------- atualizado_em automático ----------
create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

drop trigger if exists itens_atualizado on public.itens;
create trigger itens_atualizado before update on public.itens
for each row execute function public.tocar_atualizado_em();

-- ---------- Acesso sem login (decisão do usuário) ----------
alter table public.itens         enable row level security;
alter table public.configuracoes enable row level security;

grant select, insert, update, delete on public.itens to anon, authenticated;
grant select, update on public.configuracoes to anon, authenticated;

drop policy if exists itens_select on public.itens;
drop policy if exists itens_insert on public.itens;
drop policy if exists itens_update on public.itens;
drop policy if exists itens_delete on public.itens;
create policy itens_select on public.itens for select to anon, authenticated using (true);
create policy itens_insert on public.itens for insert to anon, authenticated with check (true);
create policy itens_update on public.itens for update to anon, authenticated using (true) with check (true);
create policy itens_delete on public.itens for delete to anon, authenticated using (true);

drop policy if exists config_select on public.configuracoes;
drop policy if exists config_update on public.configuracoes;
create policy config_select on public.configuracoes for select to anon, authenticated using (true);
create policy config_update on public.configuracoes for update to anon, authenticated using (id = 1) with check (id = 1);

-- ---------- Tempo real ----------
do $$
begin
  begin alter publication supabase_realtime add table public.itens;         exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.configuracoes; exception when duplicate_object then null; end;
end $$;

-- ---------- Storage: bucket público "fotos" ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists fotos_select on storage.objects;
drop policy if exists fotos_insert on storage.objects;
drop policy if exists fotos_update on storage.objects;
drop policy if exists fotos_delete on storage.objects;
create policy fotos_select on storage.objects for select to anon, authenticated using (bucket_id = 'fotos');
create policy fotos_insert on storage.objects for insert to anon, authenticated with check (bucket_id = 'fotos');
create policy fotos_update on storage.objects for update to anon, authenticated using (bucket_id = 'fotos') with check (bucket_id = 'fotos');
create policy fotos_delete on storage.objects for delete to anon, authenticated using (bucket_id = 'fotos');
