-- =====================================================================
-- NiksBakerySystem - COMPLETE DATABASE SETUP (single file)
-- Developed by Nikko Dacara
--
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
--
-- * This is the ONLY SQL file the project needs.
-- * Safe to re-run: it never drops tables or deletes data.
-- =====================================================================


-- =====================================================================
-- 0. CHOOSE YOUR ADMIN PASSWORD  <-- the ONLY line you need to edit
--    This becomes the password of the 'admin' login (full admin dashboard).
-- =====================================================================
SELECT set_config('app.admin_password', 'CHANGE-ME-before-running', false);


-- Stops the script before anything is created if you forgot to change it.
-- (Not needed on a re-run once the 'admin' login already exists.)
DO $$
DECLARE
    admin_exists BOOLEAN := FALSE;
BEGIN
    IF to_regclass('public.users') IS NOT NULL THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.users WHERE username = ''admin'')' INTO admin_exists;
    END IF;
    IF NOT admin_exists AND current_setting('app.admin_password') LIKE 'CHANGE-ME%' THEN
        RAISE EXCEPTION 'Edit the admin password on the set_config line at the top of this file, then run again.';
    END IF;
END $$;


-- =====================================================================
-- 1. ITEMS (product catalog)
--    The app fills this automatically from constants.ts on first load.
-- =====================================================================
CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    unit VARCHAR(30) NOT NULL DEFAULT 'pc',
    cost_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    selling_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- =====================================================================
-- 2. USERS (logins) + ROLES
--    role 'admin' -> Admin Dashboard. role 'staff' -> Point of Sale.
-- =====================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    role VARCHAR(20) NOT NULL DEFAULT 'staff',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- (for databases that already had a users table without roles)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'staff';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'staff'));

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ---- Password encryption (bcrypt) --------------------------------------
-- Passwords are NEVER stored as typed. A trigger hashes anything written to
-- users.password (from this script, the Table Editor, or SQL), so you can
-- keep typing plain passwords when adding a user and they are hashed
-- automatically. A bcrypt hash can't be turned back into the password.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION hash_user_password() RETURNS TRIGGER AS $$
BEGIN
    -- Already a bcrypt hash (e.g. an unrelated edit to the row)? leave it alone.
    IF NEW.password !~ '^\$2[aby]\$[0-9]{2}\$' THEN
        NEW.password := crypt(NEW.password, gen_salt('bf', 10));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, extensions;

DROP TRIGGER IF EXISTS trg_hash_user_password ON users;
CREATE TRIGGER trg_hash_user_password
    BEFORE INSERT OR UPDATE OF password ON users
    FOR EACH ROW EXECUTE FUNCTION hash_user_password();

-- Hash any passwords that were saved as plain text before this ran.
UPDATE users SET password = password WHERE password !~ '^\$2[aby]\$[0-9]{2}\$';

-- ---- Login check happens INSIDE the database --------------------------
-- The browser sends the typed username + password to this function and gets
-- back only id / username / display name / role. It never receives (or can
-- read) any password or hash. Username matching ignores capital letters.
CREATE OR REPLACE FUNCTION login_user(p_username TEXT, p_password TEXT)
RETURNS TABLE (id UUID, username VARCHAR, display_name VARCHAR, role VARCHAR)
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
    SELECT u.id, u.username, u.display_name, u.role
      FROM users u
     WHERE lower(u.username) = lower(btrim(p_username))
       AND u.is_active
       AND u.password = crypt(p_password, u.password)
     LIMIT 1;
$$;

-- Lock the users table away from the public key; only login_user() may touch it.
-- (You still manage users in the dashboard Table Editor / SQL Editor.)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE users FROM anon, authenticated;
        REVOKE ALL ON FUNCTION login_user(TEXT, TEXT) FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION login_user(TEXT, TEXT) TO anon, authenticated;
    END IF;
END $$;

-- ---- Starter accounts (passwords are hashed by the trigger above) ------
INSERT INTO users (username, password, display_name, role) VALUES
    ('nikkoStaff', 'password1Bakery', 'nikko', 'staff'),
    ('nikkoAdmin', 'password2Bakery', 'nikko', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Admin login. Re-running never overwrites an existing admin's password.
INSERT INTO users (username, password, display_name, role)
VALUES ('admin', current_setting('app.admin_password'), 'Admin', 'admin')
ON CONFLICT (username) DO UPDATE SET role = 'admin';


-- =====================================================================
-- 3. SHIFTS, STOCK, PRODUCTION, SALES, DISCHARGES, REPORTS
-- =====================================================================

-- Work sessions
CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(50),
    user_display_name VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    start_time TIMESTAMPTZ DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    opening_cash DECIMAL(10,2) DEFAULT 0,
    closing_cash DECIMAL(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Running stock - the source of truth for "stock remaining"
CREATE TABLE IF NOT EXISTS global_inventory (
    item_id UUID PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Production history
CREATE TABLE IF NOT EXISTS productions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    user_id VARCHAR(50),
    user_display_name VARCHAR(100),
    shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Sales (read by the admin dashboard across ALL shifts)
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- BO (back office) / waste
CREATE TABLE IF NOT EXISTS discharges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    reason VARCHAR(50),
    notes TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- End-of-shift snapshots
CREATE TABLE IF NOT EXISTS shift_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
    user_id VARCHAR(50),
    user_display_name VARCHAR(100),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    opening_cash DECIMAL(10,2),
    closing_cash DECIMAL(10,2),
    inventory_start JSONB,
    inventory_end JSONB,
    total_production INTEGER DEFAULT 0,
    total_sales DECIMAL(10,2) DEFAULT 0,
    total_sold_qty INTEGER DEFAULT 0,
    total_discharges INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- =====================================================================
-- 4. ROW LEVEL SECURITY OFF
--    The app uses the public (anon) key and has no row-level policies,
--    so RLS must be off or every read returns nothing.
--    (Do NOT click Supabase's "Automatically enable RLS" banner.)
-- =====================================================================
ALTER TABLE items            DISABLE ROW LEVEL SECURITY;
ALTER TABLE users            DISABLE ROW LEVEL SECURITY;
ALTER TABLE shifts           DISABLE ROW LEVEL SECURITY;
ALTER TABLE global_inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE productions      DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales            DISABLE ROW LEVEL SECURITY;
ALTER TABLE discharges       DISABLE ROW LEVEL SECURITY;
ALTER TABLE shift_reports    DISABLE ROW LEVEL SECURITY;


-- =====================================================================
-- 5. AUTOMATIC STOCK TRACKING
--    Production adds stock; sales and discharges remove it. Unlike the
--    old triggers, editing or deleting an entry also corrects the stock,
--    so correcting a sale or production count can't skew the numbers.
-- =====================================================================

-- Adds p_delta (may be negative) to an item's stock, never below zero.
CREATE OR REPLACE FUNCTION adjust_global_inventory(p_item UUID, p_delta INTEGER)
RETURNS void AS $$
BEGIN
    UPDATE global_inventory
       SET quantity = GREATEST(0, quantity + p_delta),
           updated_at = NOW()
     WHERE item_id = p_item;

    -- First time this item gets stock: create its row (only if the item still exists,
    -- so deleting an item never trips over its own cascade).
    IF NOT FOUND AND p_delta > 0 AND EXISTS (SELECT 1 FROM items WHERE id = p_item) THEN
        INSERT INTO global_inventory (item_id, quantity, updated_at)
        VALUES (p_item, p_delta, NOW())
        ON CONFLICT (item_id) DO UPDATE
            SET quantity = GREATEST(0, global_inventory.quantity + p_delta), updated_at = NOW();
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Production: stock goes UP by the quantity
CREATE OR REPLACE FUNCTION trg_production_inventory() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM adjust_global_inventory(NEW.item_id, NEW.quantity);
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM adjust_global_inventory(OLD.item_id, -OLD.quantity);
    ELSIF OLD.item_id = NEW.item_id THEN
        -- one net change, so the "never below zero" floor can't distort an edit
        PERFORM adjust_global_inventory(NEW.item_id, NEW.quantity - OLD.quantity);
    ELSE
        PERFORM adjust_global_inventory(OLD.item_id, -OLD.quantity);
        PERFORM adjust_global_inventory(NEW.item_id,  NEW.quantity);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Sales and discharges: stock goes DOWN by the quantity
CREATE OR REPLACE FUNCTION trg_outflow_inventory() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM adjust_global_inventory(NEW.item_id, -NEW.quantity);
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM adjust_global_inventory(OLD.item_id, OLD.quantity);
    ELSIF OLD.item_id = NEW.item_id THEN
        PERFORM adjust_global_inventory(NEW.item_id, OLD.quantity - NEW.quantity);
    ELSE
        PERFORM adjust_global_inventory(OLD.item_id,  OLD.quantity);
        PERFORM adjust_global_inventory(NEW.item_id, -NEW.quantity);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Remove the old insert-only triggers if an earlier setup created them
DROP TRIGGER IF EXISTS trigger_production_update_inventory ON productions;
DROP TRIGGER IF EXISTS trigger_sale_update_inventory ON sales;
DROP TRIGGER IF EXISTS trigger_discharge_update_inventory ON discharges;

DROP TRIGGER IF EXISTS trg_production_inventory ON productions;
CREATE TRIGGER trg_production_inventory
    AFTER INSERT OR UPDATE OR DELETE ON productions
    FOR EACH ROW EXECUTE FUNCTION trg_production_inventory();

DROP TRIGGER IF EXISTS trg_sales_inventory ON sales;
CREATE TRIGGER trg_sales_inventory
    AFTER INSERT OR UPDATE OR DELETE ON sales
    FOR EACH ROW EXECUTE FUNCTION trg_outflow_inventory();

DROP TRIGGER IF EXISTS trg_discharges_inventory ON discharges;
CREATE TRIGGER trg_discharges_inventory
    AFTER INSERT OR UPDATE OR DELETE ON discharges
    FOR EACH ROW EXECUTE FUNCTION trg_outflow_inventory();

-- Give every existing item a stock row (starts at 0)
INSERT INTO global_inventory (item_id, quantity)
SELECT id, 0 FROM items
ON CONFLICT (item_id) DO NOTHING;


-- =====================================================================
-- 6. INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_productions_item_id   ON productions(item_id);
CREATE INDEX IF NOT EXISTS idx_productions_shift_id  ON productions(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_shift_id        ON sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_item_id         ON sales(item_id);
CREATE INDEX IF NOT EXISTS idx_sales_timestamp       ON sales(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_discharges_shift_id   ON discharges(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_reports_end_time ON shift_reports(end_time DESC);
