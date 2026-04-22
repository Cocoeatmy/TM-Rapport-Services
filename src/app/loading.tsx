// Squelette global affiché pendant que la route se charge.
// Next.js l'injecte automatiquement autour du <main>, donc l'utilisateur voit
// immédiatement quelque chose d'utile au lieu d'un écran blanc pendant le JS.
export default function Loading() {
  return (
    <div className="p-4 space-y-3">
      <div className="h-12 rounded-xl bg-gray-200/70 dark:bg-gray-800/60 animate-pulse" />
      <div className="grid grid-cols-3 gap-2">
        <div className="h-10 rounded-xl bg-gray-200/70 dark:bg-gray-800/60 animate-pulse" />
        <div className="h-10 rounded-xl bg-gray-200/70 dark:bg-gray-800/60 animate-pulse" />
        <div className="h-10 rounded-xl bg-gray-200/70 dark:bg-gray-800/60 animate-pulse" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-2xl bg-gray-200/60 dark:bg-gray-800/50 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
