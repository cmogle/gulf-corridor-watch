-- Widen social_signals.provider to support Telegram and RSS-item signals (Tier 2 prep)
alter table social_signals drop constraint social_signals_provider_check;
alter table social_signals add constraint social_signals_provider_check
  check (provider in ('x', 'telegram', 'rss_item'));
