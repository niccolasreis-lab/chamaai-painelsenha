import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCloudTicketStatus, peopleAhead } from '../chamacliente/src/services/ticketState';

test('mapeia cada estado cloud sem transformar conclusão em chamada', () => {
  assert.equal(mapCloudTicketStatus('aguardando'), 'aguardando');
  assert.equal(mapCloudTicketStatus('chamada'), 'chamando');
  assert.equal(mapCloudTicketStatus('atendida'), 'atendida');
  assert.equal(mapCloudTicketStatus('cancelada'), 'cancelada');
});

test('converte posição em pessoas à frente sem valores negativos', () => {
  assert.equal(peopleAhead(null), null);
  assert.equal(peopleAhead(0), 0);
  assert.equal(peopleAhead(1), 0);
  assert.equal(peopleAhead(4), 3);
});
