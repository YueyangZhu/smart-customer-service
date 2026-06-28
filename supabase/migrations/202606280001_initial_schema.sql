create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.sessions (
  id text primary key,
  user_id text not null,
  coze_conversation_id text not null default '',
  status text not null default 'active',
  resolved boolean,
  ticket_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id text primary key,
  session_id text not null references public.sessions(id) on delete cascade,
  role text not null,
  content text not null,
  intent text,
  confidence numeric,
  action text,
  source text,
  risk_level text,
  order_no text,
  need_handoff boolean,
  handoff_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key,
  product text not null,
  amount numeric not null default 0,
  status text not null,
  logistics text not null default '',
  refund text not null default '',
  refundable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.refunds (
  id text primary key,
  session_id text not null references public.sessions(id) on delete cascade,
  order_no text not null references public.orders(id),
  reason text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id text primary key,
  session_id text not null references public.sessions(id) on delete cascade,
  intent text not null,
  confidence numeric,
  summary text not null,
  handoff_reason text,
  priority text not null default 'normal',
  status text not null default 'open',
  agent text,
  claimed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_replies (
  id text primary key,
  ticket_id text not null references public.tickets(id) on delete cascade,
  session_id text not null references public.sessions(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id text primary key,
  session_id text not null references public.sessions(id) on delete cascade,
  score integer not null check (score between 1 and 5),
  resolved boolean not null default false,
  comment text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_gaps (
  id text primary key,
  question text not null unique,
  count integer not null default 1,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_session_created_idx on public.messages(session_id, created_at);
create index if not exists tickets_created_idx on public.tickets(created_at desc);
create index if not exists tickets_status_priority_idx on public.tickets(status, priority);
create index if not exists ratings_session_idx on public.ratings(session_id);
create index if not exists refunds_session_idx on public.refunds(session_id);
create index if not exists knowledge_gaps_count_idx on public.knowledge_gaps(count desc);

drop trigger if exists set_sessions_updated_at on public.sessions;
create trigger set_sessions_updated_at before update on public.sessions for each row execute function public.set_updated_at();
drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
drop trigger if exists set_refunds_updated_at on public.refunds;
create trigger set_refunds_updated_at before update on public.refunds for each row execute function public.set_updated_at();
drop trigger if exists set_tickets_updated_at on public.tickets;
create trigger set_tickets_updated_at before update on public.tickets for each row execute function public.set_updated_at();
drop trigger if exists set_knowledge_gaps_updated_at on public.knowledge_gaps;
create trigger set_knowledge_gaps_updated_at before update on public.knowledge_gaps for each row execute function public.set_updated_at();

alter table public.sessions enable row level security;
alter table public.messages enable row level security;
alter table public.orders enable row level security;
alter table public.refunds enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_replies enable row level security;
alter table public.ratings enable row level security;
alter table public.knowledge_gaps enable row level security;

revoke all on public.sessions from anon, authenticated;
revoke all on public.messages from anon, authenticated;
revoke all on public.orders from anon, authenticated;
revoke all on public.refunds from anon, authenticated;
revoke all on public.tickets from anon, authenticated;
revoke all on public.ticket_replies from anon, authenticated;
revoke all on public.ratings from anon, authenticated;
revoke all on public.knowledge_gaps from anon, authenticated;

insert into public.orders (id, product, amount, status, logistics, refund, refundable)
values
  ('OD20260620001', 'Aurora 降噪耳机', 699, '运输中', '已到达上海浦东分拨中心，预计明日送达', '', true),
  ('OD20260618008', 'Luma 阅读灯', 239, '退款处理中', '', '退款审核已通过，预计 1-3 个工作日原路到账', false),
  ('OD20260612021', 'Mori 随行杯', 129, '已签收', '6 月 15 日由本人签收', '', true)
on conflict (id) do update set
  product = excluded.product,
  amount = excluded.amount,
  status = excluded.status,
  logistics = excluded.logistics,
  refund = excluded.refund,
  refundable = excluded.refundable,
  updated_at = now();
