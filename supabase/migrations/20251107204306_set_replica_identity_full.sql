/*
  # Set Replica Identity to FULL for Realtime

  1. Changes
    - Set REPLICA IDENTITY FULL on buildings table
    - Set REPLICA IDENTITY FULL on apartments table
  
  2. Purpose
    - Ensures Supabase Realtime broadcasts complete row data
    - Required for realtime subscriptions to work properly with UPDATE events
    - Allows subscribers to see all column values in change notifications
*/

ALTER TABLE buildings REPLICA IDENTITY FULL;
ALTER TABLE apartments REPLICA IDENTITY FULL;
