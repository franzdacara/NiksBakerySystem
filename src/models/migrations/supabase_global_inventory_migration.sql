-- =====================================================
-- GLOBAL INVENTORY & SHIFT REPORTS MIGRATION
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Create global_inventory table (single running inventory)
CREATE TABLE IF NOT EXISTS global_inventory (
    item_id UUID PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS for global_inventory
ALTER TABLE global_inventory DISABLE ROW LEVEL SECURITY;

-- 2. Create shift_reports table (historical records)
CREATE TABLE IF NOT EXISTS shift_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID REFERENCES shifts(id),
    user_id VARCHAR(50),
    user_display_name VARCHAR(100),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    opening_cash DECIMAL(10,2),
    closing_cash DECIMAL(10,2),
    total_sales DECIMAL(10,2),
    total_production INTEGER,
    total_discharges INTEGER,
    inventory_snapshot JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS for shift_reports
ALTER TABLE shift_reports DISABLE ROW LEVEL SECURITY;

-- 3. Initialize global_inventory from items table (if empty)
INSERT INTO global_inventory (item_id, quantity)
SELECT id, 0 FROM items
WHERE id NOT IN (SELECT item_id FROM global_inventory);

-- 4. Create index for faster report queries
CREATE INDEX IF NOT EXISTS idx_shift_reports_end_time ON shift_reports(end_time DESC);

-- 5. Add user_id column to shifts table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'shifts' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE shifts ADD COLUMN user_id VARCHAR(50);
    END IF;
END $$;
