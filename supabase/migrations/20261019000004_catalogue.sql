-- Catalogue seed. Rates mirror what the original publishes on its own pages
-- (recon.md), so prices are comparable.
--
-- unit_cost_cents is DELIBERATELY NULL: it is what we pay the provider, and
-- it is unverified. Get real fal.ai quotes and fill it in before launch -
-- architecture.md explains why this single number decides the business.

insert into models (slug, label, provider, provider_model, kind, modes,
  min_duration_s, max_duration_s, resolutions, supports_audio,
  pricing_mode, pricing, unit_cost_cents) values
('vidu-q3-turbo','Vidu Q3 Turbo','fal','fal-ai/vidu/q3/turbo','video',
  '{image}', 1, 16, '{540p,720p,1080p}', true,
  'per_second_by_resolution','{"rates":{"540p":5,"720p":9,"1080p":16}}', null),
('kling-avatar','Kling Avatar','fal','fal-ai/kling/avatar','lipsync',
  '{image,audio}', 1, 60, '{480p,720p}', true,
  'per_second_by_resolution','{"rates":{"480p":16,"720p":30}}', null),
('kling-motion-control','Kling Motion Control','fal','fal-ai/kling/v2.6/motion-control','motion',
  '{image,reference}', 1, 30, '{720p}', false,
  'per_second','{"rate":11}', null),
('gpt-image-flare','GPT Image Flare','fal','fal-ai/gpt-image/flare','image',
  '{text,image}', null, null, '{}', false,
  'per_image','{"rates":{"1k":2,"2k":3,"4k":5}}', null),
('age-progress','Age Progression','fal','fal-ai/nano-banana','image',
  '{image}', null, null, '{}', false,
  'per_image','{"rates":{"1k":3}}', null),
('fruit-character','Fruit Character','fal','fal-ai/seedance/v2.5','video',
  '{image}', 5, 5, '{480p}', false,
  'flat','{"credits":80}', null)
on conflict (slug) do nothing;

insert into tools (slug, label, blurb, default_model_id, input_schema, sort_order)
select v.slug, v.label, v.blurb, m.id, v.input_schema::jsonb, v.sort_order
from (values
  ('baby-video','Photo to video','One photo, one small movement. The place to start.',
   'vidu-q3-turbo', '{"photo":{"required":true,"label":"Baby photo","hint":"Front-facing, eyes and mouth visible"},"prompt":{"required":true,"label":"What should happen","placeholder":"Describe one movement and the mood"},"duration":[5,8,10],"resolution":["540p","720p","1080p"],"aspect":["9:16","16:9"],"skinTone":true}', 1),
  ('talking-baby','Talking baby','Record a line and the photo says it back.',
   'kling-avatar', '{"photo":{"required":true,"label":"Baby photo","hint":"Mouth, eyes and cheeks visible"},"audio":{"required":true,"label":"Your recording","hint":"Keep it short and clear"},"resolution":["480p","720p"]}', 2),
  ('dancing-baby','Dancing baby','Pick a move, the photo follows it.',
   'kling-motion-control', '{"photo":{"required":true,"label":"Baby photo"},"motionRef":{"required":true,"label":"Dance to follow","hint":"Pick a sample or add your own clip"},"duration":[5,8,10]}', 3),
  ('cartoon-baby','Cartoon baby','A cartoon portrait. Cheapest thing here.',
   'gpt-image-flare', '{"photo":{"required":true,"label":"Baby photo"},"styles":["Soft pastel","Bold outline","Watercolour","Claymation"],"size":["1k","2k","4k"],"aspect":["1:1","9:16"],"skinTone":true}', 4),
  ('grow-up','Grow up','One photo, a few different ages.',
   'age-progress', '{"photo":{"required":true,"label":"Baby photo"},"ages":[1,5,10,18,25,50,75],"size":["1k"],"skinTone":true}', 5),
  ('fruit-baby','Fruit baby','Silly, and the kids love it.',
   'fruit-character', '{"photo":{"required":true,"label":"Baby photo"},"freeText":{"required":true,"label":"Which fruit","placeholder":"mango"},"duration":[5],"resolution":["480p"],"aspect":["1:1","9:16"]}', 6)
) as v(slug, label, blurb, model_slug, input_schema, sort_order)
join models m on m.slug = v.model_slug
on conflict (slug) do nothing;

insert into tool_models (tool_id, model_id)
select t.id, t.default_model_id from tools t
on conflict do nothing;
