-- Migration: add-user-profiles
-- Adds extended user profile system with onboarding support

-- Add onboarding flag and avatar to users table (fast auth-level check)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'onboarding_completed_at'
    ) THEN
        ALTER TABLE users ADD COLUMN onboarding_completed_at TIMESTAMP DEFAULT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'avatar_url'
    ) THEN
        ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512) DEFAULT NULL;
    END IF;
END $$;

-- Extended profile table (1:1 with users)
CREATE TABLE IF NOT EXISTS user_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Personal info
    country_code CHAR(2),
    city VARCHAR(255),
    region VARCHAR(255),
    birth_year INTEGER,
    gender VARCHAR(20),

    -- About
    bio TEXT,
    profession VARCHAR(255),
    skills TEXT[],
    interests TEXT[],
    hobbies TEXT[],

    -- Motivation
    motivation TEXT,
    participation_interest VARCHAR(50),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
