/*
  # Enable Realtime on Buildings and Apartments Tables

  1. Configuration
    - Enable realtime replication for buildings table
    - Enable realtime replication for apartments table
  
  2. Purpose
    - Allows real-time subscriptions to detect changes
    - Enables automatic UI updates when data changes
*/

ALTER PUBLICATION supabase_realtime ADD TABLE buildings;
ALTER PUBLICATION supabase_realtime ADD TABLE apartments;
