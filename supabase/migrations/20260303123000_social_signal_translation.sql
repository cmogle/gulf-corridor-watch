alter table if exists social_signals
  add column if not exists text_original text not null default '',
  add column if not exists language_original text null,
  add column if not exists text_en text null,
  add column if not exists translation_provider text null,
  add column if not exists translation_confidence numeric(4,3) null,
  add column if not exists translation_status text not null default 'not_needed';
alter table if exists social_signals
  drop constraint if exists social_signals_translation_status_check;
alter table if exists social_signals
  add constraint social_signals_translation_status_check
  check (translation_status in ('not_needed','translated','failed'));
update social_signals
set
  text_original = case when coalesce(text_original, '') = '' then text else text_original end,
  language_original = coalesce(language_original, null),
  translation_status = coalesce(translation_status, 'not_needed')
where true;
