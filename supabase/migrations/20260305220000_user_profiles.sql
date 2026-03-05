-- User profiles for authenticated users

CREATE TABLE user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  home_airport text,
  tracked_routes jsonb DEFAULT '[]',
  tracked_flights jsonb DEFAULT '[]',
  detail_preference text DEFAULT 'standard' CHECK (detail_preference IN ('concise', 'standard', 'comprehensive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE INDEX idx_user_profiles_home_airport ON user_profiles(home_airport)
  WHERE home_airport IS NOT NULL;
