-- 20260813200000_clean_canonical_stadium_names.sql
--
-- Corrects mojibake-corrupted German special characters (ä/ö/ü/ß) in already-stored reference
-- data. Root cause (verified live against the remote DB, not guessed): applying a migration's SQL
-- text remotely at some point re-encoded UTF-8 bytes as if they were Windows-1252, then stored the
-- result as UTF-8 again -- e.g. "München" (UTF-8 bytes for ü: 0xC3 0xBC) became "MÃ¼nchen" (Ã =
-- U+00C3, ¼ = U+00BC, each now its own separate, wrong character). This affects every migration
-- that has ever been applied through that same remote-execution path, including the stadium_aliases
-- seed row from 20260813150000 -- it is not specific to 20260813190000's data, and not caused by
-- this repository's SQL files themselves (they are correctly UTF-8 encoded on disk; verified by
-- reading them back). supabase/functions/sync-football-games/index.ts never writes to
-- public.stadiums (only public.games.stadium_id), so it cannot be the source either -- see that
-- file's "Stadium linking" comment.
--
-- This migration is not a general fix for the encoding pipeline (that lives outside this repo, in
-- whatever tool is used to apply migrations remotely -- ensure it uses UTF-8 client encoding to
-- avoid this recurring). It only corrects the specific rows already confirmed corrupted via a
-- live, read-only query, each keyed by its existing, unchanged primary key. No row is deleted, no
-- id/stadium_id/game/post is touched, no other column is modified. Every affected value's
-- corrected form was derived mechanically (decode each corrupted character back through
-- Windows-1252 to raw bytes, then decode those bytes as UTF-8) and cross-checked against the
-- known-correct names already documented in 20260813190000_complete_stadium_mapping.sql. Not run
-- remotely as part of this step.

-- public.stadiums: name and/or city corrected on 18 rows.
update public.stadiums set name = 'SchücoArena' where id = '11111111-1111-4111-8111-111111111111';
update public.stadiums set city = 'Köln' where id = 'e3a6b37e-56c4-4243-b6d3-814239a4c89c';
update public.stadiums set name = 'Stadion An der Alten Försterei' where id = 'b3b99fae-1311-4b05-a908-6b7d17c7d5ab';
update public.stadiums set city = 'Mönchengladbach' where id = '0eb1ff80-e6b6-4480-9d9e-268b3022b582';
update public.stadiums set city = 'München' where id = 'd581c5d2-57ad-4899-ad28-c9db7f432853';
update public.stadiums set city = 'Nürnberg' where id = '9aa28c40-dca8-41e3-864b-ca39495dd165';
update public.stadiums set city = 'Fürth' where id = '54d7c5fa-b749-4cd2-87d3-cb4232487b4e';
update public.stadiums set name = 'Merck-Stadion am Böllenfalltor' where id = 'bde140bd-557a-4120-a611-b2927fbca8d6';
update public.stadiums set name = 'Bremer Brücke', city = 'Osnabrück' where id = '6f1e34c1-d68c-4794-83d7-adcdccb0b4da';
update public.stadiums set city = 'Saarbrücken' where id = '77b8077c-f066-41cc-a4a7-31578b0b2d7b';
update public.stadiums set city = 'Düsseldorf' where id = '34b62879-172c-40c5-b958-b9c7f4b21752';
update public.stadiums set name = 'Südstadion', city = 'Köln' where id = '8cecebad-432b-4641-bab8-5e0e74e76792';
update public.stadiums set name = 'LVM-Preußenstadion', city = 'Münster' where id = '7ca85e80-1c63-4828-8c02-0f69f412cfec';
update public.stadiums set name = 'Stadion an der Hafenstraße' where id = 'e881fb65-f62c-453f-8fd2-169e31d182e2';
update public.stadiums set city = 'Großaspach' where id = 'bba4a884-d1ef-4c7e-8acd-9afd261f8ad4';
update public.stadiums set name = 'Hänsch-Arena' where id = 'c041d289-f904-46d7-a3c8-031ca7d0b977';
update public.stadiums set name = 'Sportpark Höhenberg', city = 'Köln' where id = 'e9a810f8-bbec-475f-a11f-a4748a595e44';
update public.stadiums set city = 'Würzburg' where id = '0160c011-2db3-4e2f-a91a-2a96b93eec00';

-- public.team_stadium_mappings.team_name: reference data (never shown directly in the UI, only
-- used to resolve stadium_id), corrected for data hygiene as explicitly requested. 13 rows.
update public.team_stadium_mappings set team_name = '1. FC Köln' where id = '3260a473-ca58-4da8-a09e-690038a3645d';
update public.team_stadium_mappings set team_name = 'Borussia Mönchengladbach' where id = 'cb0fc7d3-7d25-4415-996d-d6f99e33a499';
update public.team_stadium_mappings set team_name = 'FC Bayern München' where id = '90ab774d-c03e-4d1f-88b1-312330fd4e08';
update public.team_stadium_mappings set team_name = '1. FC Nürnberg' where id = '39b2c4cc-d4c9-4f9b-a70d-9d936026e16d';
update public.team_stadium_mappings set team_name = 'SpVgg Greuther Fürth' where id = '4ad2b5cc-2ecc-402f-88d2-bf0ad36fe8aa';
update public.team_stadium_mappings set team_name = 'VfL Osnabrück' where id = '3b8dcb37-7f3f-4fa1-b388-d280952bf692';
update public.team_stadium_mappings set team_name = '1. FC Saarbrücken' where id = '73bab926-a6aa-4b5b-a59a-4eb749acea76';
update public.team_stadium_mappings set team_name = 'Fortuna Düsseldorf' where id = '168d10af-dbdb-4d27-a31d-0aa5b9ae9ce1';
update public.team_stadium_mappings set team_name = 'Fortuna Köln' where id = '7a56ee48-7576-40f6-acfb-79f1b38cd1f9';
update public.team_stadium_mappings set team_name = 'Preußen Münster' where id = 'dc88388c-6ff6-4c24-b7df-060991126920';
update public.team_stadium_mappings set team_name = 'SG Sonnenhof Großaspach' where id = '1409048c-0c13-46c6-810d-cb596cfcfc9c';
update public.team_stadium_mappings set team_name = 'Viktoria Köln' where id = 'af12d1e2-401e-449c-83c4-45b46b217cce';
update public.team_stadium_mappings set team_name = 'Würzburger Kickers' where id = '43250280-2c29-4caa-9d68-feb879ac7a39';

-- public.stadium_aliases.alias: 1 row (pre-existing since 20260813150000, not from this round's
-- earlier migration). normalized_alias is untouched -- it was already plain lowercase ASCII
-- ("schuecoarena") and never carried the mojibake.
update public.stadium_aliases set alias = 'SchücoArena' where id = 'a3d94bb5-aaea-4de5-bc34-da4ded9e058f';
