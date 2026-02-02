# Configuração Google OAuth no Supabase

## Resumo da Migração

O sistema de autenticação foi migrado para usar **Supabase Auth** com Google OAuth provider. Isso substitui o sistema customizado anterior.

## Configuração Necessária

### 1. Acessar Dashboard do Supabase

URL: https://supabase.com/dashboard/project/ibwecmqihluczufnjnur/auth/providers

### 2. Habilitar Google Provider

1. Na lista de providers, encontre **Google**
2. Clique no toggle para **habilitar**
3. Preencha os campos:
   - **Client ID**: `495601781938-bseca29asvo3d69rgqcmvcism3oee8hn.apps.googleusercontent.com`
   - **Client Secret**: `(obtenha do Google Cloud Console)`
   - **Authorized Redirect URI**: `https://tm-ia.vercel.app/api/auth/callback`
4. Clique em **Save**

### 3. Configurar URL Configuration no Supabase (MUITO IMPORTANTE)

Se você estava mexendo em **outros projetos** (ex: barbearia) usando o **mesmo projeto do Supabase**, o Supabase pode redirecionar para o *Site URL* errado.

Vá em: Dashboard → Authentication → **URL Configuration**

- **Site URL**: `https://tm-ia.vercel.app`
- **Additional Redirect URLs** (adicione TODAS que você usa):
  - `https://tm-ia.vercel.app/auth/callback`
  - `https://tm-ia.vercel.app/**`
  - `http://localhost:5173/auth/callback`
  - `http://localhost:5173/**`

Se existir alguma URL da barbearia aqui e você não quer esse comportamento, **remova**.

> Sintoma clássico de config errada: você inicia login no TM-IA, autentica no Google, e volta para o site da barbearia.

### 3. Configurar Google Cloud Console

Acesse: https://console.cloud.google.com/apis/credentials

1. Selecione o projeto com o Client ID: `495601781938-bseca29asvo3d69rgqcmvcism3oee8hn`
2. Clique em **OAuth 2.0 Client ID** → **Web client**
3. Em **Authorized redirect URIs**, adicione:
   - `https://ibwecmqihluczufnjnur.supabase.co/auth/v1/callback`
   - `https://tm-ia.vercel.app/api/auth/callback`
4. Clique em **Save**

### 4. Configurar Variáveis de Ambiente

No arquivo `.env.local`, certifique-se de ter:

```env
# Supabase Configuration
SUPABASE_URL="https://ibwecmqihluczufnjnur.supabase.co"
SUPABASE_ANON_KEY="sua_anon_key_aqui"
SUPABASE_SERVICE_ROLE_KEY="sua_service_role_key_aqui"

# Google OAuth (opcional - apenas para referência)
GOOGLE_CLIENT_ID="495601781938-bseca29asvo3d69rgqcmvcism3oee8hn.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="seu_client_secret_aqui"
```

Para obter as chaves do Supabase:
1. Dashboard → Project Settings → API
2. Copie **Project URL** e **anon public**
3. Copie **service_role secret** (somente para uso server-side)

### 5. Configurar no Vercel (Produção)

Adicione as seguintes Environment Variables no Vercel:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Mudanças no Código

### Endpoints Atualizados

1. **`/api/auth/login`** - Agora usa Supabase Auth
2. **`/api/auth/register`** - Agora usa Supabase Auth
3. **`/api/auth/google`** - Redireciona para OAuth do Supabase
4. **`/api/auth/callback`** - Recebe callback do Supabase Auth

### Frontend

O frontend continua funcionando da mesma forma:
- Envia credenciais para `/api/auth/login` ou `/api/auth/register`
- Recebe token JWT do Supabase
- Armazena token no localStorage
- Usa token em requisições subsequentes

## Testando

### Login com Email/Senha

```bash
curl -X POST https://tm-ia.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "senha123"}'
```

### Login com Google

1. Acesse: https://tm-ia.vercel.app
2. Clique em "Continuar com Google"
3. O fluxo OAuth redireciona para Google → Supabase → seu app

## Troubleshooting

### Erro: "Unsupported provider: provider is not enabled"

**Solução**: O Google provider não está habilitado no Supabase Dashboard. Siga o Passo 2 acima.

### Erro: "redirect_uri_mismatch"

**Solução**: As URIs de redirect não estão configuradas corretamente. Verifique:
1. No Supabase: `https://tm-ia.vercel.app/api/auth/callback`
2. No Google Cloud: `https://ibwecmqihluczufnjnur.supabase.co/auth/v1/callback`

### Erro: "Invalid client"

**Solução**: Client ID ou Client Secret incorretos. Verifique no Google Cloud Console e no Supabase Dashboard.

## Vantagens da Migração

✅ **Segurança**: Tokens gerenciados pelo Supabase (mais seguro)  
✅ **Escalabilidade**: Suporte nativo a múltiplos providers  
✅ **Recursos**: Refresh tokens automáticos, sessões, revogação  
✅ **Manutenção**: Menos código customizado para manter  
✅ **Conformidade**: GDPR, HIPAA ready

## Próximos Passos

1. Configure as variáveis de ambiente no Vercel
2. Teste o login em produção
3. Considere adicionar outros providers (GitHub, Apple, etc.)
4. Implemente confirmação de email (opcional)
5. Configure políticas de RLS no Supabase para segurança adicional

## Suporte

Em caso de problemas:
1. Verifique logs no Vercel: `vercel logs --production`
2. Verifique logs no Supabase: Dashboard → Logs
3. Teste localmente: `npm run dev`
