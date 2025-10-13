import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kjdouaccurnbbvqtzxva.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZG91YWNjdXJuYmJ2cXR6eHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNTQ2MzEsImV4cCI6MjA3NDczMDYzMX0.hXvzJMnTbp0BI0K3ORGy5ZnOFhCW4ANCEO8QgIJcnO0'
export const supabase = createClient(supabaseUrl, supabaseKey)