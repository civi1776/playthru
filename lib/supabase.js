import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const supabaseUrl     = 'https://mqzxuzpaaaogqyfdzvxf.supabase.co';
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xenh1enBhYWFvZ3F5ZmR6dnhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDYyNTMsImV4cCI6MjA4OTEyMjI1M30.J6ygxYBwf3SJ_nX5bx3BaqKzHI6anicIAdnvZSDtyG4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage:              AsyncStorage,
    autoRefreshToken:     true,
    persistSession:       true,
    detectSessionInUrl:   false,
  },
});

