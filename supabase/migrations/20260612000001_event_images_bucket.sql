-- Storage bucket for event images, uploaded via /api/events/image (service role).
-- Public read so images can be displayed on public event signup pages.
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-images', 'event-images', true)
ON CONFLICT (id) DO NOTHING;
