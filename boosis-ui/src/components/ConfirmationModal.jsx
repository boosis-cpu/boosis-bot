
import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

const ConfirmationModal = ({ modal, onConfirm, onClose }) => {
    if (!modal.show) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, animation: 'fadeIn 0.2s ease'
        }}>
            <div className="panel" style={{
                width: '400px', padding: '30px',
                border: `1px solid ${modal.type === 'danger' ? '#f85149' : '#30363d'}`,
                textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
            }}>
                <div style={{ marginBottom: '20px', color: modal.type === 'danger' ? '#f85149' : '#58a6ff' }}>
                    {modal.type === 'danger' ? <AlertTriangle size={48} style={{ margin: '0 auto' }} /> : <ShieldCheck size={48} style={{ margin: '0 auto' }} />}
                </div>
                <h2 style={{ marginBottom: '16px', color: '#c9d1d9' }}>{modal.title}</h2>
                <p style={{ color: '#8b949e', marginBottom: '30px', fontSize: '14px', lineHeight: '1.5' }}>
                    {modal.message}
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 20px',
                            background: 'transparent',
                            border: '1px solid #30363d',
                            color: '#c9d1d9',
                            borderRadius: '6px',
                            cursor: 'pointer'
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            padding: '10px 20px',
                            background: modal.type === 'danger' ? '#f85149' : '#238636',
                            border: 'none',
                            color: 'white',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
