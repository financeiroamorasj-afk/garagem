import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

let env = fs.readFileSync('.env', 'utf8');
env = env.replace(/\r/g, '');
let dbUrl = '';
for (let line of env.split('\n')) {
    if (line.startsWith('DATABASE_URL=')) {
        dbUrl = line.substring('DATABASE_URL='.length).trim();
        if (dbUrl.startsWith('"')) dbUrl = dbUrl.substring(1);
        if (dbUrl.endsWith('"')) dbUrl = dbUrl.substring(0, dbUrl.length - 1);
    }
}
dbUrl = dbUrl.replace(/\[(.*?)\]/, '$1');
let parts = dbUrl.split('@');
if (parts.length > 2) {
    let hostPart = parts.pop();
    let credentialsPart = parts.join('@');
    let credParts = credentialsPart.split(':');
    let password = credParts.pop();
    let userPart = credParts.join(':');
    dbUrl = `${userPart}:${encodeURIComponent(password)}@${hostPart}`;
}

const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

async function run() {
    try {
        await client.connect();
        console.log('Fixing RLS for profissionais...');
        
        const sql = `
            -- 1. Ensure the helper function exists and is SECURITY DEFINER
            CREATE OR REPLACE FUNCTION get_my_role()
            RETURNS TEXT AS $$
            BEGIN
              RETURN (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1);
            END;
            $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

            -- 2. Drop existing policies on profissionais
            DROP POLICY IF EXISTS "Users can select from same barbearia" ON profissionais;
            DROP POLICY IF EXISTS "Admins have full access to profissionais" ON profissionais;

            -- 3. Create Safe Policies
            CREATE POLICY "Users can select from same barbearia" 
            ON profissionais FOR SELECT 
            USING (barbearia_id = get_my_barbearia_id());

            CREATE POLICY "Admins have full access to profissionais" 
            ON profissionais FOR ALL 
            USING (barbearia_id = get_my_barbearia_id() AND get_my_role() = 'admin')
            WITH CHECK (barbearia_id = get_my_barbearia_id() AND get_my_role() = 'admin');
            
            ALTER TABLE profissionais ENABLE ROW LEVEL SECURITY;
        `;
        await client.query(sql);
        console.log('Fixed profissionais RLS!');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

run();
