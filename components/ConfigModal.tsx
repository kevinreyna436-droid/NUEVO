
import React, { useState, useEffect } from 'react';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose }) => {
  const [configJson, setConfigJson] = useState('');
  const [databaseId, setDatabaseId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('creata_firebase_config');
    if (saved) {
      try {
          const parsed = JSON.parse(saved);
          // Separar el databaseId del JSON para mostrarlo en su propio input
          if (parsed.databaseId) {
              setDatabaseId(parsed.databaseId);
              // Lo quitamos temporalmente del JSON visual para no duplicarlo
              const { databaseId, ...rest } = parsed;
              setConfigJson(JSON.stringify(rest, null, 2));
          } else {
              setConfigJson(saved);
          }
      } catch (e) {
          setConfigJson(saved);
      }
    }
  }, [isOpen]);

  const handleSave = () => {
    try {
      setError(null);
      // Limpiar el input en caso de que el usuario pegue "const firebaseConfig = { ... }"
      let cleanInput = configJson.trim();
      if (cleanInput.includes('=')) {
          const parts = cleanInput.split('=');
          cleanInput = parts[1].trim();
          if (cleanInput.endsWith(';')) cleanInput = cleanInput.slice(0, -1);
      }

      // Validar que sea JSON válido (o similar a JSON)
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
      
      // --- VALIDACIÓN DE SEGURIDAD CRÍTICA ---
      if (parsed.type === 'service_account' || parsed.private_key || parsed.private_key_id) {
          throw new Error(
              "🛑 ¡DETENTE! Estás intentando usar una 'Service Account Key' (Llave Privada de Admin).\n\n" +
              "Esta llave da acceso TOTAL a tu cuenta y NUNCA debe usarse en una página web visible al público.\n\n" +
              "✅ Lo que necesitas es la 'Configuración Web':\n" +
              "1. Ve a Firebase Console > Configuración del Proyecto (⚙️).\n" +
              "2. Baja hasta el final a 'Tus aplicaciones'.\n" +
              "3. Selecciona la opción Web (</>).\n" +
              "4. Copia el objeto que tiene 'apiKey', 'authDomain', etc."
          );
      }

      // Validar campos mínimos correctos
      if (!parsed.apiKey || !parsed.projectId) {
        throw new Error("Faltan campos obligatorios (apiKey, projectId). Revisa que hayas copiado el objeto correcto.");
      }

      // Añadir el databaseId si el usuario lo escribió
      if (databaseId.trim()) {
          parsed.databaseId = databaseId.trim();
      }

      localStorage.setItem('creata_firebase_config', JSON.stringify(parsed, null, 2));
      alert("Configuración guardada correctamente. La página se recargará para conectar.");
      window.location.reload();
    } catch (e: any) {
      setError(e.message);
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
                <p className="text-xs text-gray-500 mt-1">Vincula tu propio proyecto de Firebase.</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-black">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        <div className="p-8 overflow-y-auto space-y-6">
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800 leading-relaxed">
                <strong>Instrucciones:</strong>
                <ol className="list-decimal list-inside mt-2 space-y-1 text-xs text-blue-900">
                    <li>Ve a <a href="https://console.firebase.google.com" target="_blank" className="underline font-bold">Firebase Console</a>.</li>
                    <li>Ve a <strong>Configuración del Proyecto</strong> (icono de engranaje ⚙️).</li>
                    <li>Baja hasta la sección <strong>"Tus aplicaciones"</strong>.</li>
                    <li>Si no tienes una app Web, haz clic en <strong>( &lt;/&gt; )</strong> para crearla.</li>
                    <li>Copia el código dentro de <code>const firebaseConfig = ...</code></li>
                </ol>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold uppercase text-gray-500 mb-2 tracking-widest">1. Pegar Configuración Aquí:</label>
                    <textarea 
                        value={configJson}
                        onChange={(e) => { setConfigJson(e.target.value); setError(null); }}
                        className={`w-full h-40 p-4 bg-gray-900 font-mono text-xs rounded-xl focus:outline-none focus:ring-2 ${error ? 'ring-red-500 border-red-500 text-red-100' : 'focus:ring-black text-green-400'}`}
                        placeholder={`{
  apiKey: "AIzaSy...",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
}`}
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold uppercase text-gray-500 mb-2 tracking-widest">2. ID de Base de Datos (Opcional):</label>
                    <input 
                        type="text"
                        value={databaseId}
                        onChange={(e) => setDatabaseId(e.target.value)}
                        placeholder="Ej: telas"
                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black font-medium text-slate-900"
                    />
                    <p className="text-[10px] text-gray-400 mt-1 pl-1">
                        Solo si creaste una base de datos con nombre personalizado (distinto a <code>(default)</code>).
                    </p>
                </div>

                {error && (
                    <div className="bg-red-50 p-4 rounded-xl border border-red-200 flex gap-3 items-start animate-fade-in">
                        <svg className="w-6 h-6 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        <p className="text-red-700 text-xs font-bold whitespace-pre-wrap">{error}</p>
                    </div>
                )}
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
