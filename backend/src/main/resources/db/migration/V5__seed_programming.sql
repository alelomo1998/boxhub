-- Reference data: global movement catalog + benchmark library. Seeded via migration so it
-- exists in every environment (not just dev). Names + category + modality only — no media (BACKLOG).

insert into movement (name, category, modality) values
  -- Barbell
  ('Back Squat','BARBELL','W'),('Front Squat','BARBELL','W'),('Overhead Squat','BARBELL','W'),
  ('Deadlift','BARBELL','W'),('Sumo Deadlift','BARBELL','W'),('Deadlift High Pull','BARBELL','W'),
  ('Shoulder Press','BARBELL','W'),('Push Press','BARBELL','W'),('Push Jerk','BARBELL','W'),
  ('Split Jerk','BARBELL','W'),('Thruster','BARBELL','W'),('Clean','BARBELL','W'),
  ('Power Clean','BARBELL','W'),('Hang Clean','BARBELL','W'),('Hang Power Clean','BARBELL','W'),
  ('Squat Clean','BARBELL','W'),('Clean and Jerk','BARBELL','W'),('Snatch','BARBELL','W'),
  ('Power Snatch','BARBELL','W'),('Hang Snatch','BARBELL','W'),('Hang Power Snatch','BARBELL','W'),
  ('Squat Snatch','BARBELL','W'),('Snatch Balance','BARBELL','W'),('Bench Press','BARBELL','W'),
  ('Bent Over Row','BARBELL','W'),('Good Morning','BARBELL','W'),('Sumo Deadlift High Pull','BARBELL','W'),
  ('Overhead Lunge','BARBELL','W'),('Front Rack Lunge','BARBELL','W'),('Clean Pull','BARBELL','W'),
  ('Snatch Pull','BARBELL','W'),('Push Jerk Behind Neck','BARBELL','W'),
  -- Dumbbell
  ('Dumbbell Snatch','DUMBBELL','W'),('Dumbbell Clean','DUMBBELL','W'),('Dumbbell Thruster','DUMBBELL','W'),
  ('Dumbbell Push Press','DUMBBELL','W'),('Dumbbell Shoulder Press','DUMBBELL','W'),
  ('Dumbbell Bench Press','DUMBBELL','W'),('Dumbbell Row','DUMBBELL','W'),('Dumbbell Front Squat','DUMBBELL','W'),
  ('Dumbbell Lunge','DUMBBELL','W'),('Dumbbell Box Step-Up','DUMBBELL','W'),('Devil Press','DUMBBELL','W'),
  ('Dumbbell Deadlift','DUMBBELL','W'),('Single-Arm Dumbbell Overhead Squat','DUMBBELL','W'),
  -- Kettlebell
  ('Kettlebell Swing','KETTLEBELL','W'),('American Kettlebell Swing','KETTLEBELL','W'),
  ('Russian Kettlebell Swing','KETTLEBELL','W'),('Kettlebell Snatch','KETTLEBELL','W'),
  ('Kettlebell Clean','KETTLEBELL','W'),('Kettlebell Goblet Squat','KETTLEBELL','W'),
  ('Kettlebell Push Press','KETTLEBELL','W'),('Turkish Get-Up','KETTLEBELL','W'),
  ('Kettlebell Deadlift','KETTLEBELL','W'),('Kettlebell Front Rack Carry','KETTLEBELL','W'),
  -- Gymnastics
  ('Pull-Up','GYMNASTICS','G'),('Chin-Up','GYMNASTICS','G'),('Chest-to-Bar Pull-Up','GYMNASTICS','G'),
  ('Kipping Pull-Up','GYMNASTICS','G'),('Butterfly Pull-Up','GYMNASTICS','G'),('Strict Pull-Up','GYMNASTICS','G'),
  ('Toes-to-Bar','GYMNASTICS','G'),('Knees-to-Elbow','GYMNASTICS','G'),('Hanging Knee Raise','GYMNASTICS','G'),
  ('Muscle-Up','GYMNASTICS','G'),('Bar Muscle-Up','GYMNASTICS','G'),('Ring Muscle-Up','GYMNASTICS','G'),
  ('Push-Up','GYMNASTICS','G'),('Hand-Release Push-Up','GYMNASTICS','G'),('Ring Dip','GYMNASTICS','G'),
  ('Dip','GYMNASTICS','G'),('Handstand Push-Up','GYMNASTICS','G'),('Strict Handstand Push-Up','GYMNASTICS','G'),
  ('Handstand Walk','GYMNASTICS','G'),('Wall Walk','GYMNASTICS','G'),('Pistol','GYMNASTICS','G'),
  ('Air Squat','GYMNASTICS','G'),('Jumping Squat','GYMNASTICS','G'),('Box Jump','GYMNASTICS','G'),
  ('Box Jump Over','GYMNASTICS','G'),('Step-Up','GYMNASTICS','G'),('Burpee','GYMNASTICS','G'),
  ('Bar-Facing Burpee','GYMNASTICS','G'),('Burpee Box Jump Over','GYMNASTICS','G'),('Sit-Up','GYMNASTICS','G'),
  ('GHD Sit-Up','GYMNASTICS','G'),('Back Extension','GYMNASTICS','G'),('Hip Extension','GYMNASTICS','G'),
  ('Ring Row','GYMNASTICS','G'),('Rope Climb','GYMNASTICS','G'),('Legless Rope Climb','GYMNASTICS','G'),
  ('L-Sit','GYMNASTICS','G'),('Hollow Rock','GYMNASTICS','G'),('Plank','GYMNASTICS','G'),
  ('V-Up','GYMNASTICS','G'),('Broad Jump','GYMNASTICS','G'),('Lunge','GYMNASTICS','G'),
  ('Walking Lunge','GYMNASTICS','G'),('Bear Crawl','GYMNASTICS','G'),('Inchworm','GYMNASTICS','G'),
  -- Monostructural / cardio
  ('Row','MONOSTRUCTURAL','M'),('Run','MONOSTRUCTURAL','M'),('Assault Bike','MONOSTRUCTURAL','M'),
  ('Echo Bike','MONOSTRUCTURAL','M'),('BikeErg','MONOSTRUCTURAL','M'),('SkiErg','MONOSTRUCTURAL','M'),
  ('Double-Under','MONOSTRUCTURAL','M'),('Single-Under','MONOSTRUCTURAL','M'),('Shuttle Run','MONOSTRUCTURAL','M'),
  ('Swim','MONOSTRUCTURAL','M'),('Sled Push','MONOSTRUCTURAL','M'),('Sled Pull','MONOSTRUCTURAL','M'),
  -- Odd object
  ('Wall Ball','ODD_OBJECT','W'),('Med Ball Clean','ODD_OBJECT','W'),('D-Ball Over Shoulder','ODD_OBJECT','W'),
  ('Sandbag Clean','ODD_OBJECT','W'),('Sandbag Carry','ODD_OBJECT','W'),('Yoke Carry','ODD_OBJECT','W'),
  ('Farmers Carry','ODD_OBJECT','W'),('Tire Flip','ODD_OBJECT','W'),('Rope Undulation','ODD_OBJECT','M'),
  ('Atlas Stone','ODD_OBJECT','W');

insert into benchmark_template (name, kind, score_type, time_cap_seconds, body_text) values
  ('Fran','GIRL','TIME',null,'21-15-9 reps for time: Thrusters (95/65 lb), Pull-Ups'),
  ('Grace','GIRL','TIME',null,'30 Clean and Jerks (135/95 lb) for time'),
  ('Isabel','GIRL','TIME',null,'30 Snatches (135/95 lb) for time'),
  ('Helen','GIRL','TIME',null,'3 rounds for time: 400m Run, 21 Kettlebell Swings (1.5/1 pood), 12 Pull-Ups'),
  ('Cindy','GIRL','ROUNDS_REPS',1200,'AMRAP 20: 5 Pull-Ups, 10 Push-Ups, 15 Air Squats'),
  ('Diane','GIRL','TIME',null,'21-15-9 reps for time: Deadlifts (225/155 lb), Handstand Push-Ups'),
  ('Elizabeth','GIRL','TIME',null,'21-15-9 reps for time: Cleans (135/95 lb), Ring Dips'),
  ('Karen','GIRL','TIME',null,'150 Wall Balls (20/14 lb) for time'),
  ('Annie','GIRL','TIME',null,'50-40-30-20-10 reps for time: Double-Unders, Sit-Ups'),
  ('Angie','GIRL','TIME',null,'For time: 100 Pull-Ups, 100 Push-Ups, 100 Sit-Ups, 100 Air Squats'),
  ('Barbara','GIRL','TIME',null,'5 rounds: 20 Pull-Ups, 30 Push-Ups, 40 Sit-Ups, 50 Air Squats, 3 min rest'),
  ('Nancy','GIRL','TIME',null,'5 rounds for time: 400m Run, 15 Overhead Squats (95/65 lb)'),
  ('Murph','HERO','TIME',null,'For time: 1 mile Run, 100 Pull-Ups, 200 Push-Ups, 300 Air Squats, 1 mile Run. Wear a 20/14 lb vest.'),
  ('DT','HERO','TIME',null,'5 rounds for time: 12 Deadlifts, 9 Hang Power Cleans, 6 Push Jerks (155/105 lb)'),
  ('JT','HERO','TIME',null,'21-15-9 reps for time: Handstand Push-Ups, Ring Dips, Push-Ups'),
  ('Michael','HERO','TIME',null,'3 rounds for time: 800m Run, 50 Back Extensions, 50 Sit-Ups'),
  ('Chad','HERO','TIME',null,'1000 Box Step-Ups (20 in) for time. Wear a 45/35 lb ruck.'),
  ('Randy','HERO','TIME',null,'75 Power Snatches (75/55 lb) for time');
