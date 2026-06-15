-- ==============================================================================
-- SCRIPT DE CORREÇÃO: Habilitar exclusão em cascata (ON DELETE CASCADE)
-- ==============================================================================
-- Por que isso é necessário?
-- Atualmente, quando o sistema tenta limpar as senhas do dia anterior, 
-- ele falha porque existem feedbacks (avaliações) ligados a essas senhas.
-- Esse script altera a trava (Foreign Key) para que, ao apagar uma senha,
-- os feedbacks vinculados a ela sejam apagados automaticamente junto com ela,
-- mantendo a nuvem 100% limpa todos os dias.
-- ==============================================================================

-- 1. Remove a trava atual que impede a exclusão
ALTER TABLE feedbacks
DROP CONSTRAINT IF EXISTS feedbacks_ticket_id_fkey;

-- 2. Recria a trava com a regra "ON DELETE CASCADE"
ALTER TABLE feedbacks
ADD CONSTRAINT feedbacks_ticket_id_fkey
FOREIGN KEY (ticket_id) 
REFERENCES senhas_publicas(id)
ON DELETE CASCADE;
