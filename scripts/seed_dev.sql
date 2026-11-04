-- Moni Cafe — local development seed (NOT a migration; never run in production).
-- One demo seller + shop and three demo coffees with variants.
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING.
--
--   psql "$DATABASE_URL" -f scripts/seed_dev.sql
--
-- The demo user's password hash is a placeholder; log-in is not possible
-- until the auth mutations land and the seed is updated with a bcrypt hash.

BEGIN;

INSERT INTO users (id, email, password_hash, display_name, role) VALUES
  ('00000000-0000-4000-8000-000000000001', 'demo-seller@monicacafe.dev', '!disabled', '示範烘豆師', 'SELLER')
ON CONFLICT DO NOTHING;

INSERT INTO shops (id, owner_id, slug, name, description, city, lat, lng) VALUES
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001',
   'demo-roastery', '晨光烘豆所 Dawn Roastery',
   '台北大稻埕的小型烘豆室，專注淺焙單品。A small Dadaocheng roastery focused on light-roast single origins.',
   '台北市', 25.0553, 121.5103)
ON CONFLICT DO NOTHING;

INSERT INTO coffees (id, shop_id, name, slug, description, origin_country_id, variety_id,
                     processing_method_id, roast_level, flavor_notes, is_published)
SELECT v.id::uuid, '00000000-0000-4000-8000-000000000101', v.name, v.slug, v.descr,
       (SELECT id FROM origin_countries   WHERE name_en = v.origin),
       (SELECT id FROM coffee_varieties   WHERE name    = v.variety),
       (SELECT id FROM processing_methods WHERE name_en = v.process),
       v.roast::roast_level, v.notes::text[], true
FROM (VALUES
  ('00000000-0000-4000-8000-000000000201', '耶加雪菲 孔加 水洗', 'demo-yirgacheffe-konga',
   '茉莉花香與柑橘酸質，乾淨明亮。Jasmine and citrus, clean and bright.',
   'Ethiopia', 'Heirloom', 'Washed', 'LIGHT', '{茉莉花,佛手柑,檸檬}'),
  ('00000000-0000-4000-8000-000000000202', '巴拿馬 翡翠莊園 藝伎 日曬', 'demo-panama-geisha',
   '熱帶水果與蜂蜜甜感。Tropical fruit with honeyed sweetness.',
   'Panama', 'Geisha', 'Natural', 'LIGHT', '{芒果,蜂蜜,白花}'),
  ('00000000-0000-4000-8000-000000000203', '哥倫比亞 慧蘭 蜜處理', 'demo-colombia-huila',
   '堅果可可，適合拿鐵。Nutty and chocolatey, great with milk.',
   'Colombia', 'Caturra', 'Honey', 'MEDIUM_DARK', '{黑巧克力,焦糖,杏仁}')
) AS v(id, name, slug, descr, origin, variety, process, roast, notes)
ON CONFLICT DO NOTHING;

INSERT INTO variants (id, coffee_id, grind, weight_g, price_twd, stock) VALUES
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', 'WHOLE_BEAN', 200, 450, 20),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000201', 'MEDIUM',     200, 450, 10),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000202', 'WHOLE_BEAN', 100, 1200, 5),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000203', 'WHOLE_BEAN', 454, 680, 30),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000203', 'ESPRESSO',   454, 680, 15)
ON CONFLICT DO NOTHING;

COMMIT;
