-- 024: origins, varieties and processes that real specialty menus use and our
-- dropdowns lacked (#174). Found by the reference-shop gap report
-- (scripts/reference_gaps.sh) over nine roasters' lists (#170–#173, #299–#303).
-- Spelling variants of these and of older values ("Typica Mejorado" / "Mejorado",
-- "74-158 Kurume", "Sydra", "Dry Washed") are aliases in scripts/seed_reference.sql,
-- not rows here. Values with no published coffee stay hidden from /coffees (#151).
-- ON CONFLICT keeps a database that already has one of them working.

INSERT INTO origin_countries (name_en, name_zh, region) VALUES
  ('Ecuador', '厄瓜多', 'Americas'),
  ('Mexico',  '墨西哥', 'Americas')
ON CONFLICT (name_en) DO NOTHING;

INSERT INTO coffee_varieties (name, description) VALUES
  ('74110',          'Ethiopian JARC selection from the Metu Bishari forest; floral and citrus.'),
  ('74158',          'Ethiopian JARC selection (often sold as Kurume); delicate, tea-like.'),
  ('Bourbon Aji',    'Colombian Bourbon type with a pepper-like (ají) shaped cherry; bright and fruity.'),
  ('Castillo',       'Colombian rust-resistant hybrid from Cenicafé; clean and sweet.'),
  ('Chiroso',        'Colombian (Antioquia) variety of Ethiopian lineage; floral, Geisha-like.'),
  ('Colombia',       'Variedad Colombia: Caturra × Timor hybrid, rust resistant; mild and balanced.'),
  ('H1',             'Centroamericano F1 hybrid; high yield with good cup quality.'),
  ('Java',           'Typica-related selection from Java, grown in Central America; tea-like and clean.'),
  ('Marageisha',     'Cross of Maragogipe and Geisha; large bean with floral notes.'),
  ('Milenio',        'Central American F1 hybrid; vigorous and rust resistant.'),
  ('Mixed',          'Several cultivars in one lot (e.g. SL28 + SL34 + Ruiru 11); the description names them.'),
  ('Pacas',          'Natural Bourbon mutation from El Salvador; compact plant, sweet cup.'),
  ('Papayo',         'Rare Colombian variety named for its papaya-like cherry; tropical fruit notes.'),
  ('Rume Sudan',     'Wild landrace from the Boma Plateau, South Sudan; complex and winey.'),
  ('Sarchimor',      'Villa Sarchi × Timor hybrid; disease resistant.'),
  ('Sidra',          'Ecuadorian variety (Bourbon × Typica lineage); floral and fruit-forward.'),
  ('Typica Mejorado', 'Ecuadorian "improved Typica" of Ethiopian lineage; floral and juicy.'),
  ('Wush Wush',      'Ethiopian landrace from Kaffa, now grown in Colombia; dense, fruit-forward.')
ON CONFLICT (name) DO NOTHING;

INSERT INTO processing_methods (name_en, name_zh, description) VALUES
  ('White Honey',      '白蜜',       'Least mucilage of the honey grades; close to washed, light sweetness.'),
  ('Pulped Natural',   '半日曬',     'Skin removed, dried with the mucilage on; common in Brazil.'),
  ('Lactic',           '乳酸發酵',   'Fermentation steered towards lactic acid bacteria; creamy, yoghurt-like.'),
  ('Yeast Inoculated', '酵母接種',   'Selected yeast added to the fermentation; clean, fruit-forward.'),
  ('Co-Fermented',     '共同發酵',   'Fermented with added fruit, spices or other ingredients.'),
  ('Thermal Shock',    '熱衝擊',     'Cherries alternately soaked in hot and cold water after fermentation.'),
  ('Sugarcane Decaf',  '甘蔗低咖啡因', 'Caffeine removed with ethyl acetate from sugarcane; keeps sweetness.')
ON CONFLICT (name_en) DO NOTHING;
