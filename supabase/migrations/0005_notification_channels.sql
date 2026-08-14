-- Aether AI — Migration 0005: Additional Notification Channels
--
-- Adds `telegram` and `whatsapp` as notification channels.
--
-- Why Telegram: escalation alerts need to reach a business owner on their
-- phone, promptly, without the owner opening a dashboard. SMS did that but
-- costs per message. Telegram's Bot API is free, unlimited, needs no business
-- verification or template approval, and delivers a real push notification —
-- the same property that made SMS worth having, at no cost.
--
-- Why WhatsApp is listed but not the default: an escalation alert is
-- business-initiated, so it falls outside WhatsApp's free 24-hour customer
-- service window and bills as a utility template on every send. It also
-- requires Meta business verification and pre-approved templates. It remains
-- the right channel for a business whose customers already use it, so the
-- value is supported, but it is not what a new business should be pushed
-- toward on day one.
--
-- `sms` is retained: the Twilio adapter exists and works, and removing a value
-- that live rows might reference would break them.

alter table notification_recipients
  drop constraint notification_recipients_channel_check;

alter table notification_recipients
  add constraint notification_recipients_channel_check
  check (channel in ('email', 'sms', 'telegram', 'whatsapp'));
