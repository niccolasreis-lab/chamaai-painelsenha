import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://npfqnsgjicmxwmurwosu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZnFuc2dqaWNteHdtdXJ3b3N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODQyNDQsImV4cCI6MjA5MjM2MDI0NH0.wLIFMxZkE9rjGQjZF7eFi0dyDioOGQfg1jfhRy32O90'
);

async function validate() {
  console.log('=== Validando tabelas Supabase ===\n');

  // 1. senhas_publicas — verifica coluna guiche
  const { data: s, error: e1 } = await supabase.from('senhas_publicas').select('id, numero, status, guiche').limit(1);
  if (e1) console.log('❌ senhas_publicas:', e1.message);
  else console.log('✅ senhas_publicas (com guiche):', s);

  // 2. comandos_operador — insert + select + delete
  const { data: cmd, error: e2 } = await supabase.from('comandos_operador').insert({ comando: 'TESTE', payload: { test: true }, status: 'pendente' }).select().single();
  if (e2) console.log('❌ comandos_operador INSERT:', e2.message);
  else {
    console.log('✅ comandos_operador INSERT ok:', cmd);
    await supabase.from('comandos_operador').delete().eq('id', cmd.id);
    console.log('✅ comandos_operador DELETE ok (limpeza do teste)');
  }

  // 3. configuracoes_publicas — upsert + select
  const { error: e3 } = await supabase.from('configuracoes_publicas').upsert({ chave: 'teste_validacao', valor: 'ok', updated_at: new Date().toISOString() });
  if (e3) console.log('❌ configuracoes_publicas UPSERT:', e3.message);
  else {
    const { data: cfg } = await supabase.from('configuracoes_publicas').select('*').eq('chave', 'teste_validacao').single();
    console.log('✅ configuracoes_publicas ok:', cfg);
    await supabase.from('configuracoes_publicas').delete().eq('chave', 'teste_validacao');
    console.log('✅ configuracoes_publicas DELETE ok (limpeza do teste)');
  }

  console.log('\n=== Validação concluída ===');
}

validate();
