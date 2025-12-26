
import React, { useState, useEffect } from 'react';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose }) => {
  const [configJson, setConfigJson] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('creata_firebase_config');
    if (saved) {
      setConfigJson(saved);
    }
  }, [isOpen]);

  const handleSave = () => {
    try {
      // Limpiar el input en caso de que el usuario pegue "const firebaseConfig = { ... }"
      let cleanInput = configJson.trim();
      if (cleanInput.includes('=')) {
          const parts = cleanInput.split('=');
          cleanInput = parts[1].trim();
          if (cleanInput.endsWith(';')) cleanInput = cleanInput.slice(0, -1);
      }

      // Validar que sea JSON válido (o similar a JSON)
      // Usamos Function para permitir sintaxis relajada de JS si no es JSON estricto
      let parsed;
      try {
          parsed = JSON.parse(cleanInput);
      } catch (e) {
          // Intento secundario para objetos JS pegados directamente
          try {
            parsed = new Function('return ' + cleanInput)();
          } catch(e2) {
             throw new Error("El formato no es válido. Asegúrate de copiar solo el objeto {...}");
          }
      }
      
      // Validar campos mínimos
      if (!parsed.apiKey || !parsed.projectId) {
        throw new Error("Faltan campos obligatorios (apiKey, projectId)");
      }

      localStorage.setItem('creata_firebase_config', JSON.stringify(parsed, null, 2));
      alert("Configuración guardada. La página se recargará para conectar a tu nube.");
      window.location.reload();
    } catch (e: any) {
      setError("Error: " + e.message);
    }
  };

  const handleReset = () => {
    if (confirm("¿Desconectar tu nube y volver al modo demostración?")) {
      localStorage.removeItem('creata_firebase_config');
      window.location.reload();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <div>
                <h2 className="font-serif text-2xl font-bold text-slate-900">Conectar Tu Nube</h2>
                <p className="text-xs text-gray-500 mt-1">Vincula tu propio proyecto de Firebase para guardar datos.</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-black">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        <div className="p-8 overflow-y-auto space-y-6">
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800 leading-relaxed">
                <strong>Instrucciones:</strong>
                <ol className="list-decimal list-inside mt-2 space-y-1 text-xs text-blue-900">
                    <li>Ve a <a href="https://console.firebase.google.com" target="_blank" className="underline font-bold">Firebase Console</a> y crea un proyecto.</li>
                    <li>En el menú lateral, activa <strong>Firestore Database</strong> y <strong>Storage</strong>.</li>
                    <li>En <strong>Authentication</strong>, activa el proveedor "Anónimo".</li>
                    <li>Ve al engranaje (⚙️) {'>'} Configuración del proyecto.</li>
                    <li>Copia el objeto de configuración (`firebaseConfig`) y pégalo abajo.</li>
                </ol>
            </div>

            <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-2 tracking-widest">Pegar Configuración Aquí:</label>
                <textarea 
                    value={configJson}
                    onChange={(e) => { setConfigJson(e.target.value); setError(null); }}
                    className="w-full h-48 p-4 bg-gray-900 text-green-400 font-mono text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder={`{
  apiKey: "AIzaSy...",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "...",
  appId: "..."
}`}
                />
                {error && <p className="text-red-500 text-xs font-bold mt-2 bg-red-50 p-2 rounded">{error}</p>}
            </div>
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
            <button onClick={handleReset} className="text-red-500 text-xs font-bold uppercase tracking-widest hover:text-red-700">Restaurar Defecto</button>
            <button 
                onClick={handleSave}
                className="bg-black text-white px-8 py-3 rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg hover:scale-105 transition-transform"
            >
                Guardar y Conectar
            </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigModal;
