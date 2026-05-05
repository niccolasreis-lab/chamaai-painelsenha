import { useState } from 'react';
import AdminLayout from './AdminLayout';

export default function Devices() {
  const [scanning, setScanning] = useState(false);
  const [devices, _setDevices] = useState([
    { id: 1, name: 'Totem Principal', type: 'Totem', status: 'Online', ip: '192.168.1.10', lastSeen: 'Agora' },
    { id: 2, name: 'Telão Recepção', type: 'Telão', status: 'Online', ip: '192.168.1.15', lastSeen: 'Agora' },
    { id: 3, name: 'Guichê 01', type: 'Operador', status: 'Offline', ip: '192.168.1.20', lastSeen: 'Há 2 horas' },
    { id: 4, name: 'Guichê 02', type: 'Operador', status: 'Online', ip: '192.168.1.21', lastSeen: 'Agora' },
  ]);

  const handleScan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      alert('Varredura concluída! Todos os dispositivos estão sincronizados.');
    }, 2000);
  };

  const handleRestart = (name: string) => {
    if (confirm(`Deseja enviar comando de reinicialização para ${name}?`)) {
      alert(`Comando enviado para ${name}. O dispositivo irá reiniciar em instantes.`);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-8 font-sans">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div>
            <h1 className="font-sans text-[40px] font-bold text-ink leading-tight uppercase tracking-widest">Dispositivos</h1>
            <p className="text-ink-secondary mt-2 text-lg font-semibold">Monitore e gerencie os terminais conectados ao sistema local.</p>
          </div>
          <button 
            onClick={handleScan}
            disabled={scanning}
            className={`bg-primary text-white px-8 py-4 rounded-xl font-bold shadow-lg transition-all active:scale-95 flex items-center space-x-2 outline-none uppercase tracking-widest text-sm ${scanning ? 'opacity-50' : 'hover:bg-primary-hover'}`}
          >
            <span className={`material-symbols-outlined ${scanning ? 'animate-spin' : ''}`}>sync</span>
            <span>{scanning ? 'Escaneando...' : 'Escanear Rede'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {devices.map((device) => (
            <div key={device.id} className="bg-surface rounded-[24px] p-6 shadow-sm border border-outline-variant/50 hover:border-primary/50 transition-all group">
              <div className="flex justify-between items-start mb-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                  device.type === 'Totem' ? 'bg-primary/10 text-primary' :
                  device.type === 'Telão' ? 'bg-success/10 text-success' : 'bg-ink/5 text-ink'
                }`}>
                  <span className="material-symbols-outlined text-3xl">
                    {device.type === 'Totem' ? 'confirmation_number' :
                     device.type === 'Telão' ? 'desktop_windows' : 'person'}
                  </span>
                </div>
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                  device.status === 'Online' ? 'bg-success/10 text-success border-success/20' : 'bg-error/10 text-error border-error/20'
                }`}>
                  {device.status}
                </div>
              </div>

              <h3 className="font-sans text-xl font-bold text-ink uppercase tracking-wide">{device.name}</h3>
              <p className="text-ink-secondary font-bold text-sm uppercase tracking-widest mb-4">{device.type}</p>

              <div className="space-y-2 border-t border-outline-variant/30 pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-secondary font-semibold uppercase tracking-widest text-[11px]">Endereço IP</span>
                  <span className="text-ink font-bold">{device.ip}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-secondary font-semibold uppercase tracking-widest text-[11px]">Visto por último</span>
                  <span className="text-ink font-bold">{device.lastSeen}</span>
                </div>
              </div>

              <div className="mt-6 flex gap-2">
                <button 
                  onClick={() => handleRestart(device.name)}
                  className="flex-1 py-2 bg-surface-variant text-ink font-bold rounded-lg text-xs uppercase tracking-widest hover:bg-outline-variant transition-colors outline-none"
                >
                  Reiniciar
                </button>
                <button className="p-2 text-ink-secondary hover:text-primary transition-colors outline-none">
                  <span className="material-symbols-outlined">settings</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
