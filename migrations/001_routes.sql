create table if not exists routes (
  id text primary key,
  owner text not null,
  name text not null,
  route_date date not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists routes_owner_updated_idx on routes (owner, updated_at desc);

create table if not exists address_memory (
  owner text not null,
  address_key text not null,
  client_name text not null default '',
  phone text not null default '',
  notes text not null default '',
  updated_at timestamptz not null default now(),
  primary key (owner, address_key)
);
