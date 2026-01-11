-- =====================================================
-- COMPLETE DATABASE REDESIGN FOR NIKSBAKERY
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- STEP 1: DROP OLD TABLES (if they exist)
-- =====================================================
DROP TABLE IF EXISTS shift_reports CASCADE;
DROP TABLE IF EXISTS global_inventory CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS discharges CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS production CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;

-- =====================================================
-- STEP 2: CREATE TABLES
-- =====================================================

-- 2a. shifts - User work sessions
CREATE TABLE shifts (
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

-- 2b. global_inventory - Running stock (THE source of truth)
CREATE TABLE global_inventory (
    item_id UUID PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2c. productions - Production history with user tracking
CREATE TABLE productions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    user_id VARCHAR(50),
    user_display_name VARCHAR(100),
    shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 2d. sales - Shift-based sales
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 2e. discharges - BO (Back Office) / Waste tracking
CREATE TABLE discharges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    reason VARCHAR(50),
    notes TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 2f. shift_reports - End-of-shift snapshots for history
CREATE TABLE shift_reports (
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

-- =====================================================
-- STEP 3: DISABLE RLS ON ALL TABLES
-- =====================================================
ALTER TABLE shifts DISABLE ROW LEVEL SECURITY;
ALTER TABLE global_inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE productions DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE discharges DISABLE ROW LEVEL SECURITY;
ALTER TABLE shift_reports DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 4: CREATE TRIGGER FOR PRODUCTION -> GLOBAL INVENTORY
-- =====================================================

-- Function to update global_inventory when production is added
CREATE OR REPLACE FUNCTION update_global_inventory_on_production()
RETURNS TRIGGER AS $$
BEGIN
    -- Upsert: Add quantity if exists, insert if not
    INSERT INTO global_inventory (item_id, quantity, updated_at)
    VALUES (NEW.item_id, NEW.quantity, NOW())
    ON CONFLICT (item_id)
    DO UPDATE SET 
        quantity = global_inventory.quantity + NEW.quantity,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on productions table
DROP TRIGGER IF EXISTS trigger_production_update_inventory ON productions;
CREATE TRIGGER trigger_production_update_inventory
    AFTER INSERT ON productions
    FOR EACH ROW
    EXECUTE FUNCTION update_global_inventory_on_production();

-- =====================================================
-- STEP 5: CREATE TRIGGER FOR SALES -> GLOBAL INVENTORY
-- =====================================================

-- Function to decrease global_inventory when sale is made
CREATE OR REPLACE FUNCTION update_global_inventory_on_sale()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE global_inventory 
    SET quantity = GREATEST(0, quantity - NEW.quantity),
        updated_at = NOW()
    WHERE item_id = NEW.item_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on sales table
DROP TRIGGER IF EXISTS trigger_sale_update_inventory ON sales;
CREATE TRIGGER trigger_sale_update_inventory
    AFTER INSERT ON sales
    FOR EACH ROW
    EXECUTE FUNCTION update_global_inventory_on_sale();

-- =====================================================
-- STEP 6: CREATE TRIGGER FOR DISCHARGES -> GLOBAL INVENTORY
-- =====================================================

-- Function to decrease global_inventory when discharge is made
CREATE OR REPLACE FUNCTION update_global_inventory_on_discharge()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE global_inventory 
    SET quantity = GREATEST(0, quantity - NEW.quantity),
        updated_at = NOW()
    WHERE item_id = NEW.item_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on discharges table
DROP TRIGGER IF EXISTS trigger_discharge_update_inventory ON discharges;
CREATE TRIGGER trigger_discharge_update_inventory
    AFTER INSERT ON discharges
    FOR EACH ROW
    EXECUTE FUNCTION update_global_inventory_on_discharge();

-- =====================================================
-- STEP 7: INITIALIZE GLOBAL INVENTORY FROM ITEMS
-- =====================================================
INSERT INTO global_inventory (item_id, quantity)
SELECT id, 0 FROM items
ON CONFLICT (item_id) DO NOTHING;

-- =====================================================
-- STEP 8: CREATE INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_productions_item_id ON productions(item_id);
CREATE INDEX IF NOT EXISTS idx_productions_shift_id ON productions(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_shift_id ON sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_item_id ON sales(item_id);
CREATE INDEX IF NOT EXISTS idx_discharges_shift_id ON discharges(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_reports_end_time ON shift_reports(end_time DESC);
