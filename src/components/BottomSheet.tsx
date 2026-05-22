/**
 * Composant BottomSheet
 *
 * Affiche un panneau coulissant depuis le bas de l’écran, utilisé pour les panneaux de réglages, thèmes, historique, etc.
 *
 * Props :
 * - isOpen : booléen, contrôle l’ouverture/fermeture du panneau
 * - onClose : callback appelé lors de la fermeture
 * - title : titre affiché en haut du panneau
 * - children : contenu du panneau
 *
 * Utilisation :
 * <BottomSheet isOpen={isOpen} onClose={closeFn} title="Titre"> ... </BottomSheet>
 */
interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-gray-900 rounded-t-2xl transition-transform duration-300 ease-out flex flex-col max-h-[80dvh] ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-6 py-3 shrink-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-800 transition-colors" aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-10">{children}</div>
      </div>
    </>
  );
}
