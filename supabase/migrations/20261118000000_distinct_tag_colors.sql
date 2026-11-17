-- Gives each standard prospect tag its own clearly different color (the
-- first version used similar shades). Updates every client's copy by name.
-- Keep in sync with lib/lead-tags.ts.
update outreach.lead_categories c
   set color = v.color
  from (values
    ('Follow up 1 sent', '#CA8A04'),
    ('Follow up 2 sent', '#EA580C'),
    ('Follow up 3 sent', '#9A3412'),
    ('Hot lead', '#E11D48'),
    ('Not interested', '#6B7280'),
    ('Calendly sent', '#0891B2'),
    ('Details shared', '#2563EB'),
    ('Meeting scheduled', '#7C3AED'),
    ('Meeting done', '#047857'),
    ('To follow up', '#DB2777'),
    ('Email communication', '#0D9488'),
    ('Whatsapp Communication', '#65A30D')
  ) as v(name, color)
 where c.name = v.name;
