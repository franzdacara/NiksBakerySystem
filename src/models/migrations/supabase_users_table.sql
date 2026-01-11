-- Create users table for bakery system authentication
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the initial users
INSERT INTO users (username, password, display_name) VALUES
    ('noren', 'password1Bakery', 'Noren'),
    ('grace', 'password2Bakery', 'Grace'),
    ('liz', 'password3Bakery', 'Liz');

-- Optional: Add index for faster username lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
