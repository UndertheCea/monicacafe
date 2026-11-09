-- Moni Cafe — local development seed (NOT a migration; never run in production).
-- Three demo sellers/shops (台北, 台中, 台南), six coffees with variants, one comment.
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING.
--
--   psql "$DATABASE_URL" -f scripts/seed_dev.sql
--
-- Demo sellers have a disabled password hash ("!disabled") and cannot log
-- in; use the register mutation to create a test account.

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

-- Two more demo shops (Taichung, Tainan) so /shops and the map have
-- something to show. Each shop needs its own seller (shops.owner_id UNIQUE).
INSERT INTO users (id, email, password_hash, display_name, role) VALUES
  ('00000000-0000-4000-8000-000000000002', 'demo-seller-2@monicacafe.dev', '!disabled', '山嵐咖啡', 'SELLER'),
  ('00000000-0000-4000-8000-000000000003', 'demo-seller-3@monicacafe.dev', '!disabled', '府城焙煎', 'SELLER')
ON CONFLICT DO NOTHING;

INSERT INTO shops (id, owner_id, slug, name, description, city, lat, lng) VALUES
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000002',
   'mountain-mist-coffee', '山嵐咖啡 Mountain Mist Coffee',
   '台中審計新村旁的自家烘焙咖啡館，主打東非與中美洲莊園豆。A Taichung café roasting East African and Central American estate lots.',
   '台中市', 24.1446, 120.6620),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000003',
   'fucheng-roasting', '府城焙煎所 Fucheng Roasting',
   '台南老屋裡的中深焙專門店，適合手沖與義式。A Tainan old-house roastery specialising in medium-dark roasts for filter and espresso.',
   '台南市', 22.9917, 120.2027)
ON CONFLICT DO NOTHING;

INSERT INTO coffees (id, shop_id, name, slug, description, origin_country_id, variety_id,
                     processing_method_id, roast_level, flavor_notes, is_published)
SELECT v.id::uuid, v.shop::uuid, v.name, v.slug, v.descr,
       (SELECT id FROM origin_countries   WHERE name_en = v.origin),
       (SELECT id FROM coffee_varieties   WHERE name    = v.variety),
       (SELECT id FROM processing_methods WHERE name_en = v.process),
       v.roast::roast_level, v.notes::text[], true
FROM (VALUES
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000102',
   '肯亞 涅里 AA 水洗', 'demo-kenya-nyeri-aa',
   '黑醋栗與番茄般的明亮酸質，尾韻甜感持久。Blackcurrant and bright tomato-like acidity with a long sweet finish.',
   'Kenya', 'SL28', 'Washed', 'LIGHT', '{黑醋栗,葡萄柚,紅糖}'),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000102',
   '瓜地馬拉 安提瓜 厭氧日曬', 'demo-guatemala-antigua-anaerobic',
   '酒香發酵感與莓果甜味。Boozy fermentation notes with berry sweetness.',
   'Guatemala', 'Bourbon', 'Anaerobic Natural', 'MEDIUM', '{紅酒,草莓,可可}'),
  ('00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-000000000103',
   '府城特調 義式配方', 'demo-fucheng-espresso-blend',
   '巴西與哥倫比亞配方，奶香濃郁適合拿鐵。A Brazil–Colombia blend with a creamy body for lattes.',
   'Brazil', NULL, 'Natural', 'DARK', '{黑巧克力,烤堅果,黑糖}')
) AS v(id, shop, name, slug, descr, origin, variety, process, roast, notes)
ON CONFLICT DO NOTHING;

INSERT INTO variants (id, coffee_id, grind, weight_g, price_twd, stock) VALUES
  ('00000000-0000-4000-8000-000000000306', '00000000-0000-4000-8000-000000000204', 'WHOLE_BEAN', 227, 560, 12),
  ('00000000-0000-4000-8000-000000000307', '00000000-0000-4000-8000-000000000205', 'WHOLE_BEAN', 227, 620, 8),
  ('00000000-0000-4000-8000-000000000308', '00000000-0000-4000-8000-000000000205', 'FINE',       227, 620, 0),
  ('00000000-0000-4000-8000-000000000309', '00000000-0000-4000-8000-000000000206', 'WHOLE_BEAN', 454, 520, 40),
  ('00000000-0000-4000-8000-000000000310', '00000000-0000-4000-8000-000000000206', 'ESPRESSO',   454, 520, 25)
ON CONFLICT DO NOTHING;

-- Provenance (#116, #120): producer, region and growing altitude, so the coffee
-- page, cards and search show them on a fresh install. The blend has none.
UPDATE coffees AS c SET producer = v.producer, region = v.region,
       altitude_min_m = v.amin, altitude_max_m = v.amax
FROM (VALUES
  ('00000000-0000-4000-8000-000000000201'::uuid, '孔加合作社 Konga Cooperative', 'Gedeo, Yirgacheffe', 1800, 2100),
  ('00000000-0000-4000-8000-000000000202'::uuid, '翡翠莊園 Hacienda La Esmeralda', 'Boquete, Chiriquí', 1600, 1800),
  ('00000000-0000-4000-8000-000000000203'::uuid, '', 'Huila', 1700, NULL),
  ('00000000-0000-4000-8000-000000000204'::uuid, 'Gatomboya 處理廠', 'Nyeri', 1700, 1900),
  ('00000000-0000-4000-8000-000000000205'::uuid, '', 'Antigua', 1500, 1700)
) AS v(id, producer, region, amin, amax)
WHERE c.id = v.id;

-- Brew method (#122, #127): what each coffee is roasted for, so the cards, the
-- coffee page and the ?brew= filter show something. The Antigua stays unset.
UPDATE coffees AS c SET brew_method = v.brew
FROM (VALUES
  ('00000000-0000-4000-8000-000000000201'::uuid, 'FILTER'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'FILTER'),
  ('00000000-0000-4000-8000-000000000203'::uuid, 'OMNI'),
  ('00000000-0000-4000-8000-000000000204'::uuid, 'FILTER'),
  ('00000000-0000-4000-8000-000000000206'::uuid, 'ESPRESSO')
) AS v(id, brew)
WHERE c.id = v.id;

-- Harvest year (#129, #134): relative to the current year in Taiwan so a fresh
-- install always has recent crops for ?harvest=recent. The Huila is an older
-- crop (two years back); the espresso blend mixes harvests and stays unset.
UPDATE coffees AS c SET harvest_year = EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Taipei')::int - v.years_ago
FROM (VALUES
  ('00000000-0000-4000-8000-000000000201'::uuid, 1),
  ('00000000-0000-4000-8000-000000000202'::uuid, 1),
  ('00000000-0000-4000-8000-000000000203'::uuid, 2),
  ('00000000-0000-4000-8000-000000000204'::uuid, 0),
  ('00000000-0000-4000-8000-000000000205'::uuid, 1)
) AS v(id, years_ago)
WHERE c.id = v.id;

-- Cup profile (#136, #141): acidity / sweetness / body 1–5, so the coffee page
-- and ?acidity=low show something. Low acid (≤ 2): the Huila and the espresso
-- blend. The Antigua stays unset.
UPDATE coffees AS c SET acidity = v.acidity, sweetness = v.sweetness, body = v.body
FROM (VALUES
  ('00000000-0000-4000-8000-000000000201'::uuid, 4, 3, 2),
  ('00000000-0000-4000-8000-000000000202'::uuid, 3, 5, 3),
  ('00000000-0000-4000-8000-000000000203'::uuid, 2, 4, 3),
  ('00000000-0000-4000-8000-000000000204'::uuid, 5, 3, 3),
  ('00000000-0000-4000-8000-000000000206'::uuid, 1, 3, 5)
) AS v(id, acidity, sweetness, body)
WHERE c.id = v.id;

-- One demo comment so the comment list renders on a fresh install.
INSERT INTO comments (id, coffee_id, user_id, body) VALUES
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000002', '花香非常明顯，冷掉後柑橘感更突出！Lovely florals, even better as it cools.')
ON CONFLICT DO NOTHING;

-- Demo follows so "Most followed" (#107) has an order on a fresh install:
-- 府城焙煎所 has two followers, 山嵐咖啡 one, 晨光 none.
INSERT INTO shop_follows (user_id, shop_id) VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000103'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000102')
ON CONFLICT DO NOTHING;

COMMIT;

-- Sweet / body / high-grown filters (#143–#147): the espresso blend's Brazil
-- and Colombia lots grow at 1,000–1,400 m, so ?altitude=high (1,500 m+) has a
-- coffee with an altitude to leave out. The seeded cup profiles above already
-- give ?sweet=high (Geisha 5, Huila 4), ?body=light (Yirgacheffe 2) and
-- ?body=full (the blend 5).
UPDATE coffees SET altitude_min_m = 1000, altitude_max_m = 1400
WHERE id = '00000000-0000-4000-8000-000000000206';
