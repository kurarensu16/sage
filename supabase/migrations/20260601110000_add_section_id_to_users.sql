-- Migration: Add section_id to users table
ALTER TABLE users ADD COLUMN section_id UUID REFERENCES sections(section_id) ON DELETE SET NULL;
