import { Mountain, ArrowRight, Keyboard } from 'lucide-react'

const tips = [
  { label: 'Click any cell', desc: 'in the grid to assign staff to a shift' },
  { label: 'Auto-Schedule', desc: 'generates an optimized week — review before applying' },
  { label: 'Arrow keys', desc: 'navigate between weeks' },
  { label: 'Ctrl+S', desc: 'save the current schedule' },
  { label: 'Ctrl+Shift+A', desc: 'quick auto-schedule' },
  { label: 'ESC', desc: 'close any open modal' },
]

export default function WelcomeOverlay({ onDismiss }) {
  return (
    <div style={styles.overlay} onClick={onDismiss}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.iconRow}>
          <Mountain size={36} color="#3b82f6" />
        </div>
        <h2 style={styles.title}>Welcome to Climbing Gym Scheduler</h2>
        <p style={styles.subtitle}>
          Manage route-setting schedules across Ogden, SLC, and Soma gyms.
        </p>

        <div style={styles.tipsSection}>
          <div style={styles.tipsHeader}>
            <Keyboard size={14} color="#8b5cf6" />
            <span>Quick Tips</span>
          </div>
          {tips.map((tip, i) => (
            <div key={i} style={styles.tipRow}>
              <span style={styles.tipLabel}>{tip.label}</span>
              <span style={styles.tipDesc}>{tip.desc}</span>
            </div>
          ))}
        </div>

        <button style={styles.button} onClick={onDismiss}>
          Get Started <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: '20px',
    animation: 'modalFadeIn 0.2s ease-out',
  },
  card: {
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.12)',
    padding: '36px 32px 28px',
    maxWidth: '440px',
    width: '100%',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
    animation: 'modalSlideIn 0.25s ease-out',
    textAlign: 'center',
  },
  iconRow: {
    marginBottom: '16px',
  },
  title: {
    margin: '0 0 8px',
    fontSize: '22px',
    fontWeight: 800,
    letterSpacing: '-0.3px',
    backgroundImage: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  },
  subtitle: {
    margin: '0 0 24px',
    fontSize: '14px',
    color: '#94a3b8',
    lineHeight: 1.5,
  },
  tipsSection: {
    textAlign: 'left',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.06)',
    padding: '14px 16px',
    marginBottom: '24px',
  },
  tipsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#8b5cf6',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '10px',
  },
  tipRow: {
    display: 'flex',
    gap: '8px',
    padding: '5px 0',
    fontSize: '13px',
    alignItems: 'baseline',
  },
  tipLabel: {
    fontWeight: 600,
    color: '#e2e8f0',
    flexShrink: 0,
  },
  tipDesc: {
    color: '#94a3b8',
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 32px',
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    border: 'none',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    minHeight: '44px',
    boxShadow: '0 4px 16px rgba(59,130,246,0.3)',
  },
}
