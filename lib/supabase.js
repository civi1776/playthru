import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mqzxuzpaaaogqyfdzvxf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xenh1enBhYWFvZ3F5ZmR6dnhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDYyNTMsImV4cCI6MjA4OTEyMjI1M30.J6ygxYBwf3SJ_nX5bx3BaqKzHI6anicIAdnvZSDtyG4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

supabase.from('courses').select('count').then(({ data, error }) => {
  console.log('Supabase test:', data, error);
});
