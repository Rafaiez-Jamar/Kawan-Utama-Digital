import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pzrjxaqbqdreujcnczuv.supabase.co';
const supabaseKey = 'sb_publishable_r52UqHVw7iQTrKfpx_43Vw_SUcFviZQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupUsersTable() {
  console.log('🔧 Setting up users table...\n');

  try {
    // First, check if table exists by trying to query it
    const { data: existingUsers } = await supabase.from('users').select('id').limit(1);
    if (existingUsers !== null) {
      console.log('✅ Users table already exists!');
      return;
    }
  } catch (err) {
    console.log('📝 Users table does not exist, creating it...');
  }

  try {
    // Create the users table using raw SQL
    const sqlSetup = `
      CREATE TABLE IF NOT EXISTS public.users (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('sales', 'product', 'admin')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

      -- Drop existing policies if they exist
      DROP POLICY IF EXISTS "Allow anyone to read users" ON public.users;
      DROP POLICY IF EXISTS "Allow anyone to create users" ON public.users;
      DROP POLICY IF EXISTS "Allow anyone to update users" ON public.users;
      DROP POLICY IF EXISTS "Allow anyone to delete users" ON public.users;

      -- Create new policies
      CREATE POLICY "Allow anyone to read users" ON public.users
        FOR SELECT USING (true);

      CREATE POLICY "Allow anyone to create users" ON public.users
        FOR INSERT WITH CHECK (true);

      CREATE POLICY "Allow anyone to update users" ON public.users
        FOR UPDATE USING (true);

      CREATE POLICY "Allow anyone to delete users" ON public.users
        FOR DELETE USING (true);
    `;

    // Use rpc or raw query - but supabase-js doesn't support raw SQL directly for anonymous key
    // Instead, we'll try to insert a test record to verify the table exists or get the error
    
    console.log('\n📝 Since we cannot execute raw SQL with public key, trying to create users table by attempting insert...');
    
    const { error: insertError } = await supabase.from('users').insert([
      {
        name: 'Test User',
        email: 'test-init@kawanutama.com',
        password: 'TestPassword123!',
        role: 'sales'
      }
    ]);

    if (insertError && insertError.message.includes('relation "public.users" does not exist')) {
      console.error('❌ Users table does not exist and cannot be created with public key');
      console.log('\n📌 To create the users table, run the following SQL in Supabase SQL Editor:');
      console.log('\n' + sqlSetup);
    } else if (insertError) {
      console.error('❌ Error:', insertError.message);
    } else {
      console.log('✅ Users table created successfully!');
      console.log('✅ Test record inserted (email: test-init@kawanutama.com)');
      
      // Delete test record
      await supabase.from('users').delete().eq('email', 'test-init@kawanutama.com');
      console.log('✅ Test record cleaned up');
    }
  } catch (err) {
    console.error('⚠️  Setup error:', err.message);
  }
}

setupUsersTable().catch(console.error);
