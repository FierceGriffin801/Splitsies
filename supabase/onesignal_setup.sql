-- 1. Enable the pg_net extension to allow Postgres to make HTTP requests
create extension if not exists "pg_net";

-- 2. Create the notification function
create or replace function public.send_onesignal_notification()
returns trigger as $$
declare
  -- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  -- REPLACE THESE TWO VARIABLES WITH YOUR ACTUAL ONESIGNAL KEYS
  -- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  onesignal_app_id text := '4f60d7d1-b83d-45a6-9738-a8bef71a89f1';
  onesignal_rest_key text := 'os_v2_app_j5qnpunyhvc2nfzyvc7poguj6eliihyzdsnud5me2lns5d2fv3ujwgh6hd3zlj7frtar5jlasf64ese2si5sm2x42zmoc6ky7ycnjdy';
begin
  perform net.http_post(
      url:='https://onesignal.com/api/v1/notifications',
      headers:=json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Basic ' || onesignal_rest_key
      )::jsonb,
      body:=json_build_object(
        'app_id', onesignal_app_id,
        'include_aliases', json_build_object('external_id', json_build_array(NEW.user_id)),
        'target_channel', 'push',
        'contents', json_build_object('en', NEW.message),
        'headings', json_build_object('en', 'Splitsies')
      )::jsonb
  );
  return NEW;
end;
$$ language plpgsql;

-- 3. Create the trigger to fire whenever a new in-app notification is created
drop trigger if exists trigger_send_push on public.notifications;
create trigger trigger_send_push
after insert on public.notifications
for each row execute function public.send_onesignal_notification();
