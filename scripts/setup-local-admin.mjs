import { createClient } from '@supabase/supabase-js'

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'LOCAL_ADMIN_EMAIL',
  'LOCAL_ADMIN_PASSWORD',
]

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Variável obrigatória ausente: ${name}`)
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
)

const email = process.env.LOCAL_ADMIN_EMAIL.trim().toLowerCase()
const password = process.env.LOCAL_ADMIN_PASSWORD

const { data: barbearia, error: barbeariaError } = await supabase
  .from('barbearias')
  .upsert(
    {
      nome: 'Garagem Local',
      slug: 'garagem-local',
    },
    { onConflict: 'slug' },
  )
  .select('id, nome, slug')
  .single()

if (barbeariaError) throw barbeariaError

const { data: listedUsers, error: listUsersError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
})

if (listUsersError) throw listUsersError

let user = listedUsers.users.find((candidate) => candidate.email?.toLowerCase() === email)

if (user) {
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: { nome: 'Administrador Local' },
  })

  if (error) throw error
  user = data.user
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome: 'Administrador Local' },
  })

  if (error) throw error
  user = data.user
}

const { error: profileError } = await supabase.from('profiles').upsert(
  {
    id: user.id,
    barbearia_id: barbearia.id,
    role: 'admin',
    nome: 'Administrador Local',
    email,
  },
  { onConflict: 'id' },
)

if (profileError) throw profileError

console.log(`Administrador local pronto: ${email} (${barbearia.nome})`)
