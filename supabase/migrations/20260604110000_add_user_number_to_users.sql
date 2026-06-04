-- Migration: Add user_number column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_number VARCHAR(20) UNIQUE;
