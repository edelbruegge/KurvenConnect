-- 20260909100000_add_terms_acceptance.sql
--
-- App-Store-Vorbereitung: erfasst nachvollziehbar, wann ein Nutzer den Nutzungsbedingungen und
-- der Datenschutzerklärung zugestimmt hat -- die Registrierungs-Checkbox
-- (app/register.tsx) speichert diesen Zeitpunkt ab sofort mit.
--
-- Nullable und ohne Backfill: bereits bestehende Konten haben diese neue Checkbox nie gesehen,
-- ihnen hier rückwirkend eine Zustimmung anzudichten wäre falsch. null bedeutet also ehrlich
-- "vor Einführung dieser Checkbox registriert", nicht "hat nicht zugestimmt".
--
-- handle_new_user() (001_auth_profiles.sql) wird additiv erweitert: liest raw_user_meta_data ->>
-- 'terms_accepted' (vom Client bei signUp() als options.data mitgegeben, exakt wie display_name
-- bereits heute) und setzt terms_accepted_at nur, wenn der Client tatsächlich 'true' gesendet hat
-- -- kein automatisches now() für jeden neuen Nutzer, das würde die Checkbox wirkungslos machen.

alter table public.profiles add column if not exists terms_accepted_at timestamptz;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, terms_accepted_at)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Neues Mitglied'),
    case when new.raw_user_meta_data ->> 'terms_accepted' = 'true' then now() else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
