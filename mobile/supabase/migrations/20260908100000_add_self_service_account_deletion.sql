-- 20260908100000_add_self_service_account_deletion.sql
--
-- App-Store-Pflicht-Feature (Apple Review Guideline 5.1.1(v)): ein Nutzer, der sich in der App
-- registrieren kann, muss sein Konto auch selbst innerhalb der App wieder löschen können. Bisher
-- gab es dafür keinen Weg (bestätigt durch 20260905100000_fix_account_deletion_foreign_keys.sql's
-- eigenen Kommentar: "There is no separate account-deletion Edge Function or RPC anywhere in this
-- project") -- nur den manuellen Admin-Weg über das Supabase-Dashboard.
--
-- delete_own_account() ist bewusst ohne jeden Parameter definiert -- sie kann fachlich gar nicht
-- auf ein fremdes Konto angewendet werden, unabhängig davon, was der aufrufende Client sendet. Sie
-- löscht ausschließlich die Zeile in auth.users, deren id exakt auth.uid() des aufrufenden,
-- authentifizierten Nutzers entspricht. Das kaskadiert danach automatisch über die bereits in
-- 20260905100000 korrigierten Fremdschlüssel (on delete cascade / set null je nach Tabelle,
-- inklusive der Trigger-Logik für Gruppenbesitz) genauso, wie es das Dashboard heute schon tut --
-- dieser Fix hier ergänzt nur den fehlenden, sicheren Aufrufweg für den Nutzer selbst.
--
-- SECURITY DEFINER ist hier notwendig (nicht optional): ein normaler authenticated-Nutzer hat kein
-- DELETE-Recht auf auth.users (das darf er auch nicht). Die Funktion läuft stattdessen mit den
-- Rechten ihres Eigentümers (der Rolle, die diese Migration ausführt, wie bei jeder anderen
-- SECURITY-DEFINER-Funktion in diesem Projekt) -- genau wie apply_report_action, accept_trip_
-- request usw. bereits erhöhte Rechte für klar begrenzte, geprüfte Zwecke nutzen.
--
-- Rein additiv. Sicher mehrfach ausführbar (create or replace).

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  delete from auth.users where id = v_self;
end;
$$;

revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;
