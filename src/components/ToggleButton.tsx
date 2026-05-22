/**
 * Composant ToggleButton
 *
 * Bouton ON/OFF principal de l’application.
 *
 * Props :
 * - isActive : booléen, état actif/inactif
 * - onToggle : callback lors du clic
 * - disabled : désactive le bouton
 */
interface ToggleButtonProps {
  isActive: boolean;
  onToggle: () => void;
  disabled: boolean;
}

export function ToggleButton({ isActive, onToggle, disabled }: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={[
        "w-32 h-32 rounded-full text-white text-2xl font-bold",
        "transition-colors duration-300 focus:outline-none",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        isActive ? "bg-green-500 animate-pulse shadow-lg shadow-green-400/50" : "bg-gray-400",
      ].join(" ")}
    >
      {isActive ? "ON" : "OFF"}
    </button>
  );
}
