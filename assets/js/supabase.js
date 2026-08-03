const SUPABASE_URL = "https://jhhtwtimtduqpjqhharn.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoaHR3dGltdGR1cXBqcWhoYXJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NjQ4MTIsImV4cCI6MjEwMTM0MDgxMn0.GvBc069zEPsa_3Envuby_JCJpatTHgrT45HeGB5NEGk"

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);