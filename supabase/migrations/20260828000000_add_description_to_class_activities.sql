-- Migration: Add description column to class_activities table
-- This allows instructors to assign specific titles and descriptions to formative assessments.

ALTER TABLE public.class_activities 
ADD COLUMN IF NOT EXISTS description TEXT;
