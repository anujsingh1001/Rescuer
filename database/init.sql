CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

DO $$ BEGIN
  CREATE TYPE account_role AS ENUM ('CITIZEN', 'NGO', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE rescue_status AS ENUM ('PENDING', 'ACCEPTED', 'RESCUE_IN_PROGRESS', 'TREATMENT_IN_PROGRESS', 'COMPLETED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) UNIQUE NOT NULL,
  phone VARCHAR(25) NOT NULL,
  password_hash TEXT NOT NULL,
  role account_role NOT NULL DEFAULT 'CITIZEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ngos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_name VARCHAR(180) NOT NULL,
  description TEXT DEFAULT '',
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  address TEXT DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rescue_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citizen_id UUID NOT NULL REFERENCES users(id),
  animal_type VARCHAR(60) NOT NULL,
  emergency_type VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  status rescue_status NOT NULL DEFAULT 'PENDING',
  assigned_ngo_id UUID REFERENCES ngos(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reports_status_idx ON rescue_reports(status);
CREATE INDEX IF NOT EXISTS reports_city_idx ON rescue_reports(city, state);
CREATE INDEX IF NOT EXISTS ngos_city_idx ON ngos(city, state);
