
import React, { useState, useEffect } from 'react';
import emailjs from '@emailjs/browser';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  requiredPin?: string;
  isBlocking?: boolean; // If true, hides the close button (for App Lock)
}

// ⚠️ CONFIGURACIÓN DE CORREO ⚠️
// Regístrate gratis en https://www.emailjs.com/ para obtener estas credenciales
const EMAIL_SERVICE_ID = 'YOUR_SERVICE_ID';   // Ej: service_x9d8...
const EMAIL_TEMPLATE_ID = 'YOUR_TEMPLATE_ID'; // Ej: template_k2j1...
const EMAIL_PUBLIC_KEY = 'YOUR_PUBLIC_KEY';   // Ej: user_8Ad...

const PinModal: React.FC<PinModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  requiredPin = '2717', 
  isBlocking = false 
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0); // Contador de intentos
  const [isLocked, setIsLocked] = useState(false); // Bloqueo temporal UI

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(false);
      // No reseteamos attempts aquí para persistir intentos mientras la app esté abierta
    }
  }, [isOpen]);

  const sendSecurityAlert = async () => {
      console.warn("🚨 ALERTA DE SEGURIDAD: 4 Intentos Fallidos Detectados.");
      
      const emailParams = {
          message: `Alerta de Seguridad: Se han detectado 4 intentos fallidos de acceso al sistema Creata Collection.`,
          date: new Date().toLocaleString(),
          device: navigator.userAgent
      };

      if (EMAIL_SERVICE_ID === 'YOUR_SERVICE_ID') {
          console.log("ℹ️ Para recibir el correo real, configura las constantes en PinModal.tsx con tus datos de EmailJS.");
          alert("⚠️ SISTEMA DE SEGURIDAD: Se ha enviado una notificación al administrador por múltiples intentos fallidos.");
          return;
      }

      try {
          await emailjs.send(EMAIL_SERVICE_ID, EMAIL_TEMPLATE_ID, emailParams, EMAIL_PUBLIC_KEY);
          console.log("✅ Correo de alerta enviado exitosamente.");
          alert("⚠️ Se ha notificado al administrador sobre este intento de acceso no autorizado.");
      } catch (err) {
          console.error("❌ Error enviando alerta de correo:", err);
      }
  };

  useEffect(() => {
    if (pin.length === 4) {
      if (pin === requiredPin) {
        // ÉXITO
        setTimeout(() => {
            setAttempts(0); // Resetear intentos al acertar
            onSuccess();
            if (!isBlocking) onClose();
        }, 200);
      } else {
        // ERROR
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setError(true);
        setPin(''); // Limpiar PIN inmediatamente para UX

        // Chequeo de seguridad
        if (newAttempts >= 4) {
            setIsLocked(true);
            sendSecurityAlert();
            // Desbloquear UI después de 5 segundos para no dejar la app inutilizable eternamente, 
            // pero ya se envió el correo.
            setTimeout(() => {
                setIsLocked(false);
                setAttempts(0); 
            }, 5000);
        } else {
            setTimeout(() => {
                setError(false);
            }, 500);
        }
      }
    }
  }, [pin, onSuccess, onClose, requiredPin, isBlocking, attempts]);

  if (!isOpen) return null;

  const handleNumClick = (num: string) => {
    if (isLocked) return;
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError(false);
    }
  };

  const handleBackspace = () => {
    if (isLocked) return;
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className={`bg-white w-72 rounded-3xl shadow-2xl overflow-hidden flex flex-col p-6 relative transition-transform duration-300 ${error ? 'translate-x-[-5px] border-2 border-red-500' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {!isBlocking && (
            <button 
                onClick={onClose}
                className="absolute top-4 right-4 text-gray-300 hover:text-black"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        )}

        <div className="text-center mb-6 mt-2">
            <h3 className={`font-serif text-xl font-bold ${isLocked ? 'text-red-600 animate-pulse' : 'text-slate-900'}`}>
                {isLocked ? 'BLOQUEADO' : (isBlocking ? 'Creata Collection' : 'Seguridad')}
            </h3>
            <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">
                {isLocked ? 'Notificando al administrador...' : (isBlocking ? 'Ingrese código de acceso' : 'Ingresa la contraseña')}
            </p>
            {attempts > 0 && !isLocked && (
                <p className="text-[9px] text-red-400 mt-2 font-bold">
                    {4 - attempts} intentos restantes
                </p>
            )}
        </div>

        {/* PIN Display */}
        <div className="flex justify-center space-x-3 mb-8 h-8">
            {[0, 1, 2, 3].map((i) => (
                <div 
                    key={i} 
                    className={`w-4 h-4 rounded-full border border-gray-300 transition-all duration-200 ${
                        i < pin.length 
                            ? error ? 'bg-red-500 border-red-500' : 'bg-black border-black' 
                            : 'bg-transparent'
                    }`}
                />
            ))}
        </div>

        {/* Keypad */}
        <div className={`grid grid-cols-3 gap-3 justify-items-center ${isLocked ? 'opacity-20 pointer-events-none' : ''}`}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                    key={num}
                    onClick={() => handleNumClick(num.toString())}
                    className="w-14 h-14 rounded-full bg-gray-50 text-xl font-bold text-slate-700 hover:bg-gray-200 hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-sm"
                >
                    {num}
                </button>
            ))}
            
            {/* Empty space for alignment */}
            <div className="w-14 h-14"></div> 
            
            <button
                onClick={() => handleNumClick('0')}
                className="w-14 h-14 rounded-full bg-gray-50 text-xl font-bold text-slate-700 hover:bg-gray-200 hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-sm"
            >
                0
            </button>

            <button
                onClick={handleBackspace}
                className="w-14 h-14 rounded-full text-gray-400 hover:text-black hover:bg-gray-100 flex items-center justify-center transition-all"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" /></svg>
            </button>
        </div>
      </div>
    </div>
  );
};

export default PinModal;
