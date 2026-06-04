-- Add status column to users table
ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active';
