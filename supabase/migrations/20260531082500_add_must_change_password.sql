-- Migration to add must_change_password to users
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT TRUE;
